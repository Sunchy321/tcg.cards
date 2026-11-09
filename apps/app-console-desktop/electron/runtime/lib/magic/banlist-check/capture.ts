import { load, type CheerioAPI } from 'cheerio';
import type { SourceRow } from './types';

/** Associates visible rows with their original nodes so identical card names cannot cross sections. */
export function captureDocument($: CheerioAPI) {
  const rows: SourceRow[] = [];
  const byNode = new Map<unknown, SourceRow>();
  let section: string | null = null;
  let lead: string | null = null;
  $('h1,h2,h3,h4,p,li,summary,tr,[data-card-name],a[href*="scryfall.com/card/"]').each((_, node) => {
    if ($(node).closest('script,style,noscript,nav,footer').length) return;
    const element = node.tagName;
    const text = ($(node).text() || $(node).attr('data-card-name') || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (/^h[1-4]$/.test(element) || /^banlist$/i.test(text.replace(/\s/g, ''))) {
      section = text;
      lead = null;
    } else if (element === 'p' && !$(node).closest('li').length) {
      lead = text;
    }
    const row = { ordinal: rows.length, element, text, section, lead };
    rows.push(row);
    byNode.set(node, row);
  });
  return { rows, byNode };
}

/** Preserves visible source wording, including rows the format parser ignores. */
export function captureSource(html: string): { text: string, rows: SourceRow[] } {
  const $ = load(html);
  $('script,style,noscript,nav,footer').remove();
  const { rows } = captureDocument($);
  const content = $('main').length ? $('main') : $('body');
  return { text: content.text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim(), rows };
}
