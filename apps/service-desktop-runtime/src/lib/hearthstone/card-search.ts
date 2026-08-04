import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { LatestEntity, LatestEntityLocalization } from '@tcg-cards/db/schema/shared/hearthstone';
import { locale as localeSchema } from '@tcg-cards/model/src/hearthstone/schema/basic';

import type { LocalDb } from './hsdata-local-db';

/** One card matched by a free-text search against the latest local card data. */
export interface CardSearchResult {
  cardId: string;
  nameEn: string | null;
  nameZh: string | null;
  set: string | null;
  type: string | null;
}

/** One card resolved by exact cardId from the latest local card data. */
export interface ResolvedCardName {
  cardId: string;
  nameEn: string | null;
  nameZh: string | null;
}

type Lang = z.infer<typeof localeSchema>;

const SUPPORTED_LANGS = ['en', 'zhs'] as const;

/**
 * Searches cards by a localized name in one language. Used by the AI announcement
 * parser, which only needs a small number of candidates per provided name.
 */
export async function searchCardCandidates(db: LocalDb, name: string, lang: Lang, limit = 3) {
  try {
    return await db.select({
      cardId: LatestEntityLocalization.cardId,
      name:   LatestEntityLocalization.name,
      set:    LatestEntity.set,
      type:   LatestEntity.type,
    })
      .from(LatestEntity)
      .innerJoin(LatestEntityLocalization, and(
        eq(LatestEntity.cardId, LatestEntityLocalization.cardId),
        eq(LatestEntity.revisionHash, LatestEntityLocalization.revisionHash),
        sql`${LatestEntity.version} && ${LatestEntityLocalization.version}`,
      ))
      .where(and(
        eq(LatestEntityLocalization.lang, lang),
        ilike(LatestEntityLocalization.name, `%${name}%`),
      ))
      .limit(limit);
  } catch {
    return [];
  }
}

/**
 * Searches cards by English name, Chinese name, or cardId substring. Prefix matches
 * rank before substring matches, and each card appears at most once.
 */
export async function searchCardsByQuery(db: LocalDb, q: string, limit = 20): Promise<CardSearchResult[]> {
  const query = q.trim();
  if (!query) return [];

  const pattern = `%${query}%`;

  // Fetch generously and dedupe per cardId below so multi-language rows collapse into one result.
  const matches = await db.select({
    cardId: LatestEntityLocalization.cardId,
    lang:   LatestEntityLocalization.lang,
    name:   LatestEntityLocalization.name,
  })
    .from(LatestEntityLocalization)
    .where(and(
      inArray(LatestEntityLocalization.lang, SUPPORTED_LANGS),
      or(
        ilike(LatestEntityLocalization.name, pattern),
        ilike(LatestEntityLocalization.cardId, pattern),
      ),
    ))
    .orderBy(desc(LatestEntityLocalization.updatedAt))
    .limit(limit * 4);

  const cardIds = [...new Set(matches.map(m => m.cardId))];
  const entities = cardIds.length > 0
    ? await db.select({
        cardId: LatestEntity.cardId,
        set:    LatestEntity.set,
        type:   LatestEntity.type,
      }).from(LatestEntity).where(inArray(LatestEntity.cardId, cardIds))
    : [];
  const entityByCardId = new Map(entities.map(e => [e.cardId, e]));

  const byCardId = new Map<string, CardSearchResult>();
  for (const match of matches) {
    const entry = byCardId.get(match.cardId) ?? {
      cardId: match.cardId,
      nameEn: null,
      nameZh: null,
      set:    entityByCardId.get(match.cardId)?.set ?? null,
      type:   entityByCardId.get(match.cardId)?.type ?? null,
    };
    if (match.lang === 'en') entry.nameEn = match.name;
    if (match.lang === 'zhs') entry.nameZh = match.name;
    byCardId.set(match.cardId, entry);
  }

  const lower = query.toLowerCase();
  const rank = (result: CardSearchResult) => {
    const namePrefixHit = [result.nameEn, result.nameZh]
      .some(name => name?.toLowerCase().startsWith(lower));
    return namePrefixHit || result.cardId.toLowerCase().startsWith(lower) ? 0 : 1;
  };

  return [...byCardId.values()]
    .sort((a, b) => rank(a) - rank(b) || String(a.nameEn ?? '').localeCompare(String(b.nameEn ?? '')))
    .slice(0, limit);
}

/**
 * Resolves bilingual names for a batch of cardIds. Unknown or unimported cardIds
 * are omitted from the result.
 */
export async function resolveCardNames(db: LocalDb, cardIds: string[]): Promise<ResolvedCardName[]> {
  const ids = [...new Set(cardIds.filter(id => typeof id === 'string' && id.trim().length > 0))];
  if (ids.length === 0) return [];

  const rows = await db.select({
    cardId: LatestEntityLocalization.cardId,
    lang:   LatestEntityLocalization.lang,
    name:   LatestEntityLocalization.name,
  })
    .from(LatestEntityLocalization)
    .where(and(
      inArray(LatestEntityLocalization.cardId, ids),
      inArray(LatestEntityLocalization.lang, SUPPORTED_LANGS),
    ))
    .orderBy(desc(LatestEntityLocalization.updatedAt));

  const byCardId = new Map<string, ResolvedCardName>();
  for (const row of rows) {
    const entry = byCardId.get(row.cardId) ?? { cardId: row.cardId, nameEn: null, nameZh: null };
    if (row.lang === 'en') entry.nameEn ??= row.name;
    if (row.lang === 'zhs') entry.nameZh ??= row.name;
    byCardId.set(row.cardId, entry);
  }

  return [...byCardId.values()];
}
