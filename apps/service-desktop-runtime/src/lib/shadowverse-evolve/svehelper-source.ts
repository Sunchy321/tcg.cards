import {
  sveCardListItem,
  sveCardListResponse,
} from '#model/shadowverse/schema/data/evolve-card-list';

import type { SveCardListItem } from '#model/shadowverse/schema/data/evolve-card-list';

export const evolveZhSource = 'svehelper';
export const evolveZhOrigin = 'https://www.svehelperwin.com';
export const evolveZhCardListUrl = `${evolveZhOrigin}/api/card/getCardList`;

const requestDelayMs = 300;
const maxAttempts = 3;
const listPageSize = 100;
const maxPages = 200;

/** Structured zh-source error with a stable machine-readable code. */
export class SveHelperError extends Error {
  /** Builds one zh-source error with a stable machine-readable code. */
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SveHelperError';
  }
}

/** Sleeps for one backoff or politeness tick. */
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** One SVE Helper card-list page fetched with retry and validated by the payload model. */
export async function fetchSveCardListPage(page: number, fetcher: typeof fetch = fetch): Promise<SveCardListItem[]> {
  const url = evolveZhCardListUrl;
  let lastError: SveHelperError = new SveHelperError('NETWORK_ERROR', 'request failed.');

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetcher(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        },
        body: JSON.stringify({ pageable: { offset: (page - 1) * listPageSize, limit: listPageSize } }),
      });

      if (!response.ok) {
        throw new SveHelperError('HTTP_ERROR', `getCardList failed with HTTP ${response.status}.`);
      }

      const parsed = sveCardListResponse.parse(await response.json());

      if (parsed.code !== 200) {
        throw new SveHelperError('RESULT_CODE', `getCardList responded with code ${parsed.code}: ${parsed.msg}`);
      }

      return parsed.data.list;
    } catch (error) {
      lastError = error instanceof SveHelperError ? error : new SveHelperError('NETWORK_ERROR', error instanceof Error ? error.message : String(error));
      await sleep(attempt * 1000);
    }
  }

  throw lastError;
}

/** The complete SVE Helper card list, walked page by page. */
export async function downloadSveCardList(fetcher: typeof fetch = fetch): Promise<SveCardListItem[]> {
  const all: SveCardListItem[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page += 1) {
    const list = await fetchSveCardListPage(page, fetcher);

    if (list.length === 0) {
      break;
    }

    for (const item of list) {
      if (!seen.has(item.card_no)) {
        seen.add(item.card_no);
        all.push(item);
      }
    }

    if (list.length < listPageSize) {
      break;
    }

    await sleep(requestDelayMs);
  }

  if (all.length === 0) {
    throw new SveHelperError('EMPTY_LIST', 'SVE Helper returned no cards.');
  }

  return all;
}

/** Re-exported for import typing convenience. */
export { sveCardListItem };
