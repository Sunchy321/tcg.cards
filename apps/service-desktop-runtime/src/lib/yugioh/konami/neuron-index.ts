import { KONAMI_INDEX_TIMEOUT_MS, KONAMI_UA, sleep } from './common';

/**
 * Neuron card-index page access: the official card-search list (rp=100 rows
 * per page, sorted listing) is the shared card universe for all Konami
 * crawlers — CNOCG coverage is a subset, so the index always comes from here.
 * The page-by-page walk itself lives in the importing task (it checkpoints per
 * batch and feeds the progress bar); this module only fetches and parses.
 */

const NEURON_INDEX_BASE = 'https://www.db.yugioh-card.com/yugiohdb/card_search.action';

/** Rows requested per index page; the largest value the site accepts. */
export const NEURON_INDEX_RP = 100;

/**
 * Attempts per page before the caller should give up. Index pages are large
 * and the site is slow under load, so a single transient timeout must not
 * kill a multi-minute index walk.
 */
export const PAGE_ATTEMPTS = 3;

/** Base backoff between page attempts; grows linearly with the attempt number. */
export const PAGE_RETRY_BACKOFF_MS = 2000;

/** Canonical list URL for one 1-based page. */
export function neuronIndexPageUrl(page: number): string {
  return `${NEURON_INDEX_BASE}?ope=1&sess=1&rp=${NEURON_INDEX_RP}&mode=1&sort=1&stype=1&keyword=&page=${page}&request_locale=ja`;
}

/**
 * Extracts the card cids of one index page, in page order, deduplicated.
 * Targets the hidden `link_value` input each card row carries — the JS
 * references to `link_value` elsewhere on the page do not match this pattern.
 */
export function parseNeuronIndexCids(html: string): number[] {
  const cids: number[] = [];
  const seen = new Set<number>();
  const re = /class="link_value" value="[^"]*ope=2&cid=(\d+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const cid = Number(m[1]);
    if (!seen.has(cid)) {
      seen.add(cid);
      cids.push(cid);
    }
  }
  return cids;
}

/**
 * Extracts the total hit count from the results header
 * ("検索結果 14,305件中 1～100件を表示"), or null when the page does not
 * carry one (e.g. an empty result page). Scoped to the header wording so card
 * texts containing 件 cannot be mistaken for it.
 */
export function parseNeuronIndexTotal(html: string): number | null {
  const m = /検索結果\s*([\d,]+)件中/.exec(html);
  if (!m) return null;
  return Number(m[1].replace(/,/g, ''));
}

export interface NeuronIndexPage {
  /** Card cids found on the page, in page order, deduplicated. */
  cids:  number[];
  /** Total hit count from the results header; null when absent. */
  total: number | null;
}

/** Options for one page fetch. */
export interface FetchNeuronIndexPageOptions {
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?:      typeof fetch;
  /** Base backoff between attempts; grows linearly with the attempt number. */
  retryBackoffMs?: number;
}

/**
 * Fetches and parses one index page with a few attempts and linear backoff.
 * Once the attempts are exhausted the error is rethrown with the page number
 * attached, so a failed run names the page that killed it.
 */
export async function fetchNeuronIndexPage(
  page: number,
  { fetchImpl = fetch, retryBackoffMs = PAGE_RETRY_BACKOFF_MS }: FetchNeuronIndexPageOptions = {},
): Promise<NeuronIndexPage> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= PAGE_ATTEMPTS; attempt++) {
    try {
      const res = await fetchImpl(neuronIndexPageUrl(page), {
        headers:  { 'User-Agent': KONAMI_UA },
        redirect: 'follow',
        signal:   AbortSignal.timeout(KONAMI_INDEX_TIMEOUT_MS),
      });
      if (res.ok) {
        const html = await res.text();
        return { cids: parseNeuronIndexCids(html), total: parseNeuronIndexTotal(html) };
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < PAGE_ATTEMPTS) await sleep(retryBackoffMs * attempt);
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Neuron index page ${page} failed after ${PAGE_ATTEMPTS} attempts: ${message}`);
}
