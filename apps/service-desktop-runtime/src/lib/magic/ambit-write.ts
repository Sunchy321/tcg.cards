import { eq } from 'drizzle-orm';

import type { createDb } from '@tcg-cards/db';
import { CardAmbitOverride } from '@tcg-cards/db/schema/local/magic/ambit-override';
import { Card } from '@tcg-cards/db/schema/shared/magic/card';
import type { Ambit } from '@tcg-cards/model/ambit';

import { assembleCard } from './project/assemble';
import { classify } from './project/project-card';

/** Database client shape used by the ambit write-through (created by the caller). */
export type AmbitWriteDb = ReturnType<typeof createDb>;

/** The card's classification seed, recomputed from source signals. */
export interface AmbitSeed {
  category: string;
  ambit:    Ambit;
}

/**
 * Recomputes one card's classification seed by assembling it and running the
 * projection's own classifier, so a withdrawn override returns the card to
 * exactly the ambit the next projection would seed — never a stale guess.
 */
export async function seedAmbitFor(database: AmbitWriteDb, oracleId: string): Promise<AmbitSeed> {
  const assembled = await assembleCard(database, oracleId);
  const seeds = classify(assembled);
  return { category: seeds.category, ambit: seeds.ambit };
}

/**
 * Writes the reviewed ambit onto every live fact row of the card — the same
 * merge result a projection run would produce, applied immediately so the
 * sites see an override without waiting for a rebuild. Ambit is a card-level
 * attribute, so all version rows share the value.
 */
export async function writeCardAmbit(database: AmbitWriteDb, cardId: string, ambit: Ambit): Promise<number> {
  const updated = await database.update(Card)
    .set({ ambit })
    .where(eq(Card.cardId, cardId))
    .returning({ cardId: Card.cardId });
  return updated.length;
}

/** One card's override row, or null when the card carries no override. */
export async function overrideOf(database: AmbitWriteDb, cardId: string) {
  const row = await database.select().from(CardAmbitOverride)
    .where(eq(CardAmbitOverride.cardId, cardId))
    .then(rows => rows[0] ?? null);
  return row;
}
