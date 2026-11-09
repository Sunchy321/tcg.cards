import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { Card, CardLocalization, CardPart, Format, Print } from '@tcg-cards/db/schema/local/magic';

import { getLocalDb } from '../../hearthstone/hsdata-local-db';
import { groupCardLists } from '../announcement/data/card-groups';
import { groupEligibility, type GroupCardMeta } from './eligibility';

/** Reads one shared local snapshot for single-format and whole-report comparisons. */
export async function loadComparisonData() {
  const db = getLocalDb();
  const [formatRows, localNames] = await Promise.all([
    db.select().from(Format),
    db.selectDistinctOn([Card.cardId], {
      cardId:        Card.cardId,
      name:          Card.name,
      localizedName: CardLocalization.name,
    })
      .from(Card)
      .leftJoin(CardLocalization, and(
        eq(CardLocalization.cardId, Card.cardId),
        eq(CardLocalization.version, Card.version),
        eq(CardLocalization.locale, 'zhs'),
        isNull(CardLocalization.deletedAt),
      ))
      .where(isNull(Card.deletedAt))
      .orderBy(Card.cardId, desc(Card.version), CardLocalization.source),
  ]);

  const groups = { ...groupCardLists };
  // Classify local-only Conspiracy cards even when the source omits the collective rule.
  {
    const conspiracy = await db.selectDistinct({ cardId: Card.cardId })
      .from(Card)
      .innerJoin(CardPart, and(eq(CardPart.cardId, Card.cardId), eq(CardPart.version, Card.version)))
      .where(and(isNull(Card.deletedAt), sql`'conspiracy' = any(${CardPart.typeMain})`));
    groups.conspiracy = conspiracy.map(card => card.cardId);
  }
  const ids = [...new Set(Object.values(groups).flat())];
  const [prints, types] = await Promise.all([
    db.selectDistinct({ cardId: Print.cardId, rarity: Print.rarity, set: Print.set, games: Print.games }).from(Print).where(inArray(Print.cardId, ids)),
    db.select({ cardId: Card.cardId, typeMain: CardPart.typeMain }).from(Card)
      .innerJoin(CardPart, and(eq(CardPart.cardId, Card.cardId), eq(CardPart.version, Card.version)))
      .where(and(isNull(Card.deletedAt), inArray(Card.cardId, ids))),
  ]);
  const metadata = new Map<string, GroupCardMeta>(ids.map(id => [id, { typeMain: [], rarities: [], sets: [], releaseDate: null, games: [] }]));
  for (const print of prints) {
    const meta = metadata.get(print.cardId)!;
    meta.rarities.push(print.rarity);
    meta.sets.push(print.set);
    meta.games.push(...print.games);
  }
  for (const card of types) metadata.get(card.cardId)!.typeMain.push(...card.typeMain);
  return { formats: formatRows, localNames, groups, groupEligibility: groupEligibility(formatRows, ids, metadata) };
}

/** Local snapshot reused for every format in one report. */
export type ComparisonData = Awaited<ReturnType<typeof loadComparisonData>>;
