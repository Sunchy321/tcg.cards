import {
  cardListResponse,
  shadowverseLangs,
} from '#model/shadowverse/schema/data/card-list';

import type {
  CardCommon,
  CardEvo,
  CardRelations,
  CardStyle as CardStylePayload,
  ShadowverseLang,
} from '#model/shadowverse/schema/data/card-list';

export const shadowverseCardsSource = 'shadowverse-wb';
export const shadowverseCardsOrigin = 'https://shadowverse-wb.com';
export const shadowverseCardsPath = '/web/CardList/cardList';
export const shadowverseCardsUrl = `${shadowverseCardsOrigin}${shadowverseCardsPath}`;

/** Fixed query every full import uses; include_token captures the complete card universe. */
const fullImportQuery = 'include_token=1';

/** politeness budget: one page request per tick, with bounded retries on soft failures. */
const requestDelayMs = 400;
const maxAttempts = 3;
/** The server answers 200 with empty payloads when throttling; retry with backoff. */
const maxEmptyPageRetries = 4;
/**
 * The server page grid is fixed at 30 rows per offset step; pages may carry
 * extra attached related cards beyond that window. Advancing by the returned
 * count would drift off the grid, so the step is fixed.
 */
const pageSize = 30;
/** Full result sweeps performed when an interrupted sweep leaves holes. */
const maxSweeps = 2;

const knownDataFields = new Set([
  'cards',
  'card_details',
  'count',
  'card_set_names',
  'tribe_names',
  'skill_names',
  'skill_replace_text_names',
  'sort_card_id_list',
  'stats_list',
  'result_error_code',
  // Deliberately not imported: per-card effect-variant detail payload.
  'specific_effect_card_info',
]);

const knownCommonFields = new Set([
  'card_id',
  'name',
  'name_ruby',
  'base_card_id',
  'card_resource_id',
  'atk',
  'life',
  'flavour_text',
  'skill_text',
  'card_set_id',
  'type',
  'class',
  'tribes',
  'cost',
  'rarity',
  'cv',
  'illustrator',
  'questions',
  'is_token',
  'is_include_rotation',
  'deck_enabled_num',
  'card_image_hash',
  'card_banner_image_hash',
  'original_card_id',
  'is_starter_ability_changed',
  // Deliberately not imported: starter-deck variant payload.
  'starter_card',
]);

const knownEvoFields = new Set([
  'card_resource_id',
  'flavour_text',
  'skill_text',
  'card_image_hash',
  'card_banner_image_hash',
]);

const knownStyleFields = new Set([
  'hash',
  'evo_hash',
  'name',
  'name_ruby',
  'cv',
  'illustrator',
  'skill_text',
  'flavour_text',
  'evo_flavour_text',
]);

const knownRelationFields = new Set(['related_card_ids', 'specific_effect_card_ids']);

/** One card's full per-language payload after schema validation. */
export interface NormalizedCardData {
  cardId: number;
  common: CardCommon;
  evo: CardEvo | null;
  styles: CardStylePayload[];
}

/** One complete language snapshot of the official card universe. */
export interface NormalizedLangSnapshot {
  lang: ShadowverseLang;
  count: number;
  cards: NormalizedCardData[];
  relations: Record<string, CardRelations>;
  cardSetNames: Record<string, string>;
  unknownFields: string[];
}

/** Structured source error distinguishing retryable transport failures from bad payloads. */
export class CardsSourceError extends Error {
  /** Builds one source error with a stable machine-readable code. */
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CardsSourceError';
  }
}

/** Unknown payload keys collected as dotted paths without altering the import itself. */
function collectUnknownFields(
  payload: Record<string, unknown>,
  data: Record<string, unknown>,
  details: Record<string, unknown>,
): string[] {
  const unknown = new Set<string>();

  Object.keys(payload).forEach(key => !['data_headers', 'data'].includes(key) && unknown.add(key));
  Object.keys(data).forEach(key => !knownDataFields.has(key) && unknown.add(`data.${key}`));

  for (const detail of Object.values(details)) {
    const record = detail as Record<string, unknown>;
    Object.keys(record).forEach(key => !['common', 'evo', 'style_card_list'].includes(key) && unknown.add(`card_detail.${key}`));

    const common = record.common as Record<string, unknown> | undefined;
    if (common) {
      Object.keys(common).forEach(key => !knownCommonFields.has(key) && unknown.add(`common.${key}`));
    }

    const evo = record.evo;
    if (evo != null && !Array.isArray(evo)) {
      Object.keys(evo as Record<string, unknown>).forEach(key => !knownEvoFields.has(key) && unknown.add(`evo.${key}`));
    }

    const styles = record.style_card_list;
    if (Array.isArray(styles)) {
      for (const style of styles) {
        Object.keys(style as Record<string, unknown>).forEach(key => !knownStyleFields.has(key) && unknown.add(`style.${key}`));
      }
    }
  }

  return [...unknown].sort();
}

/** Raw validated payload normalized into typed per-language snapshots. */
export function parseCardListPayload(payload: unknown, lang: ShadowverseLang): NormalizedLangSnapshot {
  const parsed = cardListResponse.parse(payload);
  const raw = payload as Record<string, unknown>;
  const data = raw.data as Record<string, unknown>;

  if (parsed.data_headers.result_code !== 1) {
    throw new CardsSourceError('RESULT_CODE', `cardList responded with result_code ${parsed.data_headers.result_code}.`);
  }

  const cards: NormalizedCardData[] = Object.entries(parsed.data.card_details)
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([key, detail]) => {
      const cardId = Number(key);

      if (!Number.isSafeInteger(cardId) || cardId <= 0) {
        throw new CardsSourceError('INVALID_CARD_ID', `Card detail key ${key} is not a positive integer.`);
      }

      if (detail.common.card_id !== cardId) {
        throw new CardsSourceError('CARD_ID_MISMATCH', `Card detail key ${key} does not match common.card_id ${detail.common.card_id}.`);
      }

      return {
        cardId,
        common: detail.common,
        evo: detail.evo != null && !Array.isArray(detail.evo) ? detail.evo : null,
        styles: detail.style_card_list,
      };
    });

  return {
    lang,
    count: parsed.data.count,
    cards,
    relations: parsed.data.cards,
    cardSetNames: parsed.data.card_set_names,
    unknownFields: collectUnknownFields(raw, data, parsed.data.card_details as unknown as Record<string, unknown>),
  };
}

/** Sleeps for the politeness delay between page requests. */
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Determines whether one HTTP status deserves a retry with backoff. */
function isRetryableStatus(status: number) {
  return status === 403 || status === 429 || status >= 500;
}

/** One cardList page fetched with retry and backoff, validated by the payload model. */
export async function fetchCardListPage(
  lang: ShadowverseLang,
  offset: number,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const url = `${shadowverseCardsUrl}?${fullImportQuery}&offset=${offset}`;
  let lastError: CardsSourceError = new CardsSourceError('UNKNOWN', 'cardList request failed.');

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetcher(url, {
        headers: {
          accept: 'application/json',
          lang,
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        lastError = new CardsSourceError('HTTP_ERROR', `cardList request failed with HTTP ${response.status}.`);
        if (!isRetryableStatus(response.status)) {
          throw lastError;
        }
        await sleep(attempt * 1000);
        continue;
      }

      const text = await response.text();

      try {
        return JSON.parse(text);
      } catch {
        throw new CardsSourceError('INVALID_JSON', 'cardList response is not valid JSON.');
      }
    } catch (error) {
      if (error instanceof CardsSourceError && error.code !== 'HTTP_ERROR') {
        throw error;
      }
      lastError = error instanceof CardsSourceError ? error : new CardsSourceError('NETWORK_ERROR', error instanceof Error ? error.message : String(error));
      await sleep(attempt * 1000);
    }
  }

  throw lastError;
}

/**
 * The complete card universe for one language, paged from the official API.
 *
 * Server-side result ordering is not perfectly stable between requests, so a
 * single offset sweep can leave holes. When one sweep ends short of the
 * reported count, the whole result set is swept again collecting only new ids,
 * up to maxSweeps times.
 */
export async function downloadLangSnapshot(
  lang: ShadowverseLang,
  fetcher: typeof fetch = fetch,
): Promise<NormalizedLangSnapshot> {
  const seenCardIds = new Set<number>();
  let snapshot: NormalizedLangSnapshot | null = null;
  let reportedCount = 0;

  for (let sweep = 0; sweep < maxSweeps; sweep += 1) {
    let offset = 0;
    let emptyPageRetries = 0;

    while (snapshot == null || offset < snapshot.count) {
      const payload = await fetchCardListPage(lang, offset, fetcher);
      const parsed = parseCardListPayload(payload, lang);

      if (snapshot == null) {
        snapshot = parsed;
      }
      reportedCount = snapshot.count;

      if (snapshot.count === 0) {
        return snapshot;
      }

      if (parsed.cards.length === 0) {
        emptyPageRetries += 1;

        if (emptyPageRetries > maxEmptyPageRetries) {
          throw new CardsSourceError('EMPTY_PAGE', `cardList kept returning empty pages for lang ${lang} at offset ${offset}.`);
        }

        await sleep(emptyPageRetries * 2000);
        continue;
      }

      emptyPageRetries = 0;

      for (const card of parsed.cards) {
        if (!seenCardIds.has(card.cardId)) {
          seenCardIds.add(card.cardId);
          snapshot.cards.push(card);
        }
      }
      snapshot.relations = { ...snapshot.relations, ...parsed.relations };

      offset += pageSize;
      await sleep(requestDelayMs);
    }

    if (snapshot != null && seenCardIds.size >= snapshot.count) {
      return snapshot;
    }

    await sleep(requestDelayMs);
  }

  throw new CardsSourceError('INCOMPLETE_SNAPSHOT', `cardList returned ${seenCardIds.size} unique cards but reported count ${reportedCount} for lang ${lang} after ${maxSweeps} sweeps.`);
}

/** The fixed language set every full import walks, exported for task orchestration. */
export const importLangs = shadowverseLangs;
