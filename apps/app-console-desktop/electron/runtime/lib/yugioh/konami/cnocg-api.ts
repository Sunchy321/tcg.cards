import {
  CNOCG_CODE_NOT_FOUND,
  CNOCG_CODE_OK,
  cnocgDetailEnvelope,
  type CnocgCardData,
} from '#model/yugioh/schema/data/cnocg';

import { KONAMI_TIMEOUT_MS, KONAMI_UA } from './common';

/**
 * Client for the JSON API backing the official CNOCG card database. The CN
 * site (db.yugioh-card-cn.com) is a browser app on top of this API; the API
 * host itself is yugiohcarddbapi.windoent.com. It is anonymous and currently
 * needs no signature headers; the envelope carries a result code that
 * distinguishes a genuine "no CN entry" miss from transient failures.
 */

const CNOCG_DETAIL_BASE = 'https://yugiohcarddbapi.windoent.com/konami/card/detail';

/** Detail endpoint for one card. */
export function cnocgDetailUrl(cid: number): string {
  return `${CNOCG_DETAIL_BASE}?titleId=1&cardId=${cid}&lang=cn`;
}

/** One successfully resolved card: the request URL plus the parsed payload. */
export interface CnocgDetailResult {
  url:  string;
  data: CnocgCardData;
}

/**
 * Fetches one card's CNOCG detail. Returns null when the CN database has no
 * entry for the cid (code 404000); throws on transport failures and on any
 * other result code, so unknown server-side trouble is counted as an error and
 * retried on a later run instead of being cached as a miss.
 */
export async function fetchCnocgDetail(
  cid: number,
  { fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {},
): Promise<CnocgDetailResult | null> {
  const url = cnocgDetailUrl(cid);
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': KONAMI_UA },
    signal:  AbortSignal.timeout(KONAMI_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`CNOCG HTTP ${res.status} for cid=${cid}`);

  const envelope = cnocgDetailEnvelope.parse(await res.json());
  if (envelope.result.code === CNOCG_CODE_OK && envelope.response !== null) {
    return { url, data: envelope.response };
  }
  if (envelope.result.code === CNOCG_CODE_NOT_FOUND) return null;

  throw new Error(`CNOCG unexpected result code ${envelope.result.code} (${envelope.result.message}) for cid=${cid}`);
}
