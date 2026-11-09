import { EvolveSourceError, fetchEvolveHtml, sleep } from './evolve-http';
import { parseCardNos, parseEvolveDetailHtml } from './ja-official-source';

import type { ParsedEvolveDetail } from './ja-official-source';

export const evolveEnSource = 'shadowverse-evolve-en';
export const evolveEnOrigin = 'https://en.shadowverse-evolve.com';
export const evolveEnSearchPath = '/cards/searchresults';
export const evolveEnDetailPath = '/cards/';

/** Server-rendered EN search pages hold 15 cards per page. */
const enListPageSize = 15;
const enMaxPages = 2000;
const requestDelayMs = 400;

const enLabels = { craft: 'Class', cardType: 'Card Type', tribes: 'Trait', rarity: 'Rarity', product: 'Card Set' };

/** English card numbers carry an EN suffix; maps one back to its Japanese card number. */
export function enCardNoToJaCardNo(enCardNo: string): string | null {
  if (!enCardNo.endsWith('EN')) {
    return null;
  }
  return enCardNo.slice(0, -2);
}

/** Walks the full unfiltered EN search result set and returns every English card number. */
export async function downloadEnCardNos(fetcher: typeof fetch = fetch): Promise<string[]> {
  const seen: string[] = [];
  const seenSet = new Set<string>();
  let emptyPages = 0;

  for (let page = 1; page <= enMaxPages; page += 1) {
    const html = await fetchEvolveHtml(evolveEnOrigin, `${evolveEnSearchPath}?page=${page}`, fetcher);
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

    if (cardNos.length < enListPageSize) {
      break;
    }

    await sleep(requestDelayMs);
  }

  if (seen.length === 0) {
    throw new EvolveSourceError('EMPTY_LIST', 'EN card search returned no cards.');
  }

  return seen;
}

/** Parses one official EN card detail page into typed fields. */
export function parseEvolveEnDetail(html: string, requestedCardNo?: string): ParsedEvolveDetail {
  const fallback = requestedCardNo ?? /cardno=([A-Za-z0-9-]+)/.exec(html)?.[1] ?? '';
  return parseEvolveDetailHtml(html, enLabels, fallback);
}

/** Downloads and parses one EN card detail page. The EN site requires the expansion param. */
export async function downloadEnCardDetail(enCardNo: string, fetcher: typeof fetch = fetch): Promise<ParsedEvolveDetail> {
  const setCode = enCardNo.split('-')[0] ?? '';
  const expansion = setCode.length > 0 ? `&expansion=${encodeURIComponent(setCode)}` : '';
  const html = await fetchEvolveHtml(evolveEnOrigin, `${evolveEnDetailPath}?cardno=${encodeURIComponent(enCardNo)}${expansion}`, fetcher);
  return parseEvolveEnDetail(html, enCardNo);
}
