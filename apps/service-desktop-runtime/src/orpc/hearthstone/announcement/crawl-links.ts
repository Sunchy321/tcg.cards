import { ORPCError, os } from '@orpc/server';
import { z } from 'zod';
import * as cheerio from 'cheerio';

const PATCHNOTES_EN = 'https://playhearthstone.com/en-us/news/patchnotes/';
const PATCHNOTES_ZH = 'https://hs.blizzard.cn/news/patchnotes/';

export const crawlLinks = os
  .route({
    method:      'GET',
    description: 'Fetch the latest Hearthstone patch note from both EN and ZH pages',
    tags:        ['Desktop', 'Hearthstone', 'Announcement'],
  })
  .input(z.any())
  .output(z.object({
    name:  z.string(),
    date:  z.string(),
    links: z.array(z.object({ url: z.string(), label: z.string() })),
  }))
  .handler(async () => {
    const [en, zh] = await Promise.all([
      extractLatest(PATCHNOTES_EN, parseEn),
      extractLatest(PATCHNOTES_ZH, parseZh),
    ]);

    if (!en) throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Failed to extract EN patch note.' });

    const links: Array<{ url: string; label: string }> = [
      { url: en.url, label: 'blizzard' },
    ];
    if (zh) {
      links.push({ url: zh.url, label: 'blizzard-cn' });
    }

    return { name: en.title, date: en.date, links };
  });

interface PageInfo { title: string; url: string; date: string }

async function extractLatest(
  pageUrl: string,
  parser: ($: cheerio.CheerioAPI, baseUrl: string) => PageInfo | null,
): Promise<PageInfo | null> {
  const html = await fetchPage(pageUrl);
  if (!html) return null;

  const $ = cheerio.load(html);
  return parser($, pageUrl);
}

/** English page: extract from JSON-LD structured data. */
function parseEn($: cheerio.CheerioAPI, baseUrl: string): PageInfo | null {
  const jsonLd = $('script[type="application/ld+json"]').first().html();
  if (!jsonLd) return null;

  try {
    const data = JSON.parse(jsonLd);
    const items = data?.mainEntity?.itemListElement;
    if (!Array.isArray(items) || items.length === 0) return null;

    return {
      title: items[0].headline ?? '',
      url:   resolveUrl(items[0].url ?? '', baseUrl),
      date:  (items[0].datePublished ?? '').slice(0, 10),
    };
  } catch {
    return null;
  }
}

/** Chinese page: extract first link from .article-container. */
function parseZh($: cheerio.CheerioAPI, baseUrl: string): PageInfo | null {
  const link = $('.article-container a').first();
  if (!link.length) return null;

  const title = link.text().trim();
  if (!title) return null;

  const href = link.attr('href');
  if (!href) return null;

  return { title, url: resolveUrl(href, baseUrl), date: '' };
}

async function fetchPage(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TCG-Cards/1.0)' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function resolveUrl(href: string, baseUrl: string): string {
  if (href.startsWith('http')) return href;
  try { return new URL(href, baseUrl).href; } catch { return href; }
}
