import * as cheerio from 'cheerio';

import { EvolveSourceError, fetchEvolveHtml, sleep } from './evolve-http';

export const evolveJaSource = 'shadowverse-evolve-ja';
export const evolveJaOrigin = 'https://shadowverse-evolve.com';
export const evolveJaCardSearchPath = '/cardlist/cardsearch';
export const evolveJaDetailPath = '/cardlist/';

/** Server-rendered search pages hold 15 cards per page. */
const jaListPageSize = 15;
const jaMaxPages = 2000;
const requestDelayMs = 400;

/** Extracts every card number linked on one search results page. */
export function parseCardNos(html: string): string[] {
  const $ = cheerio.load(html);
  const cardNos: string[] = [];

  $('a[href*="cardno="]').each((_, element) => {
    const href = $(element).attr('href') ?? '';
    const match = /cardno=([A-Za-z0-9-]+)/.exec(href);
    const cardNo = match?.[1];
    if (cardNo != null && !cardNos.includes(cardNo)) {
      cardNos.push(cardNo);
    }
  });

  return cardNos;
}

/** Walks the full unfiltered card search result set and returns every card number. */
export async function downloadJaCardNos(fetcher: typeof fetch = fetch): Promise<string[]> {
  const seen: string[] = [];
  const seenSet = new Set<string>();
  let emptyPages = 0;

  for (let page = 1; page <= jaMaxPages; page += 1) {
    const html = await fetchEvolveHtml(evolveJaOrigin, `${evolveJaCardSearchPath}?page=${page}`, fetcher);
    const cardNos = parseCardNos(html);

    if (cardNos.length === 0) {
      emptyPages += 1;
      if (emptyPages > 2) {
        break;
      }
      await sleep(1500);
      page -= 1;
      continue;
    }

    emptyPages = 0;

    for (const cardNo of cardNos) {
      if (!seenSet.has(cardNo)) {
        seenSet.add(cardNo);
        seen.push(cardNo);
      }
    }

    if (cardNos.length < jaListPageSize) {
      break;
    }

    await sleep(requestDelayMs);
  }

  if (seen.length === 0) {
    throw new EvolveSourceError('EMPTY_LIST', 'card search returned no cards.');
  }

  return seen;
}

/** Normalizes effect markup: icon images become [alt] markers and <br> becomes newlines. */
function normalizeMarkup(html: string) {
  return html
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/g, '[$1]')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/** One parsed Evolve card detail page in one language. */
export interface ParsedEvolveDetail {
  cardNo: string;
  name: string;
  craft: string | null;
  cardType: string | null;
  tribes: string | null;
  rarity: string | null;
  product: string | null;
  cost: number | null;
  attack: number | null;
  life: number | null;
  skillText: string | null;
  flavourText: string | null;
  illustrator: string | null;
  relatedCardNos: string[];
  releaseDate: string | null;
  imageUrl: string | null;
  questions: Array<{ id: string; questionNo: string; question: string; answer: string; answeredAt: string | null }>;
}

/**
 * Core detail parser driven by per-language dt labels; both official sites share one template.
 * The requested card number is authoritative: amulet-style pages swap the illustrator
 * and card number spans, so the scraped value is only a fallback.
 */
export function parseEvolveDetailHtml(
  html: string,
  labels: { craft: string, cardType: string, tribes: string, rarity: string, product: string },
  requestedCardNo: string,
): ParsedEvolveDetail {
  const $ = cheerio.load(html);
  const box = $('.cardlist-Detail_Box').first();

  /** Parses one numeric status item, tolerating missing stats on spells and amulets. */
  const parseStatusNumber = (selector: string): number | null => {
    const element = box.find(selector).first();
    if (element.length === 0) {
      return null;
    }
    const raw = element.clone().find('.heading').remove().end().text().trim();
    const value = Number(raw);
    return raw.length > 0 && Number.isFinite(value) ? value : null;
  };

  if (box.length === 0) {
    throw new EvolveSourceError('NO_CARD', 'detail page has no card block.');
  }

  const name = box.find('h1.ttl').first().text().trim();

  if (name.length === 0) {
    throw new EvolveSourceError('INCOMPLETE_DETAIL', 'detail page is missing card name.');
  }

  const cardNo = requestedCardNo;

  const info: Record<string, string> = {};
  box.find('dl').each((_, dl) => {
    const label = $(dl).find('dt').text().trim();
    const value = $(dl).find('dd').text().trim();
    if (label.length > 0) {
      info[label] = value;
    }
  });

  const skillHtml = box.find('.detail').first().html() ?? '';
  const relatedCardNos: string[] = [];
  $('.cardlist-Detail_Relation a[href*="cardno="]').each((_, element) => {
    const match = /cardno=([A-Za-z0-9-]+)/.exec($(element).attr('href') ?? '');
    const related = match?.[1];
    if (related != null && !relatedCardNos.includes(related)) {
      relatedCardNos.push(related);
    }
  });

  const questions: ParsedEvolveDetail['questions'] = [];
  $('.cardlist-Detail_QA .qa-List_Item').each((_, item) => {
    const title = $(item).find('.qa-List_Ttl').first().text().trim();
    const titleMatch = /^(Q\d+)\s*[（(]([^）)]*)[）)]$/.exec(title);
    const question = $(item).find('.qa-List_Txt-Q').first().clone().find('span').remove().end().text().trim();
    const answer = $(item).find('.qa-List_Txt-A').first().clone().find('span').remove().end().text().trim();

    if (question.length === 0 || answer.length === 0) {
      return;
    }

    questions.push({
      id: `${cardNo}:${titleMatch?.[1] ?? title}`,
      questionNo: titleMatch?.[1] ?? title,
      question,
      answer,
      answeredAt: titleMatch?.[2] ?? null,
    });
  });

  const illustratorRaw = box.find('.illustrator .heading').first().text().trim();

  return {
    cardNo,
    name,
    craft: info[labels.craft] ?? null,
    cardType: info[labels.cardType] ?? null,
    tribes: info[labels.tribes] ?? null,
    rarity: info[labels.rarity] ?? null,
    product: info[labels.product] ?? null,
    cost: parseStatusNumber('.status-Item-Cost'),
    attack: parseStatusNumber('.status-Item-Power'),
    life: parseStatusNumber('.status-Item-Hp'),
    skillText: skillHtml.trim().length > 0 ? normalizeMarkup(skillHtml) : null,
    flavourText: box.find('.speech').first().text().trim() || null,
    // Amulet-style pages put the card number in the heading span instead of an illustrator.
    illustrator: illustratorRaw === cardNo ? null : illustratorRaw || null,
    relatedCardNos,
    releaseDate: $('.cardlist-Detail_Products .date').first().text().trim() || null,
    imageUrl: box.find('.img img').first().attr('src') ?? null,
    questions,
  };
}

const jaLabels = { craft: 'クラス', cardType: 'カード種類', tribes: 'タイプ', rarity: 'レアリティ', product: '収録商品' };

/** Parses one official JA card detail page into typed fields. */
export function parseEvolveJaDetail(html: string, requestedCardNo?: string): ParsedEvolveDetail {
  const fallback = requestedCardNo ?? /cardno=([A-Za-z0-9-]+)/.exec(html)?.[1] ?? '';
  return parseEvolveDetailHtml(html, jaLabels, fallback);
}

/** Downloads and parses one JA card detail page. */
export async function downloadJaCardDetail(cardNo: string, fetcher: typeof fetch = fetch): Promise<ParsedEvolveDetail> {
  const html = await fetchEvolveHtml(evolveJaOrigin, `${evolveJaDetailPath}?cardno=${encodeURIComponent(cardNo)}`, fetcher);
  return parseEvolveJaDetail(html, cardNo);
}
