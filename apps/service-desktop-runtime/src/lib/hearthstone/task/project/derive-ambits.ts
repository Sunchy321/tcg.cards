import { and, inArray, isNull, sql } from 'drizzle-orm';

import {
  BaseEntity,
  BaseEntityLocalization,
  BaseEntityRelation,
} from '@tcg-cards/db/schema/local/hearthstone';
import type { Ambit } from '@tcg-cards/model/ambit';

import { getLocalDb } from '../../hsdata-local-db';

import { deriveCardAmbits } from './ambit';

const AMBIT_WRITE_CHUNK = 5000;

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export interface DeriveAmbitsReport {
  /** Distinct live cards classified. */
  cards:     number;
  /** Live entity rows whose stored ambit differed from the derived value. */
  staleRows: number;
}

/**
 * Pipeline-level ambit derivation: reclassifies every live entity from its own
 * content plus the live relation graph, then writes the per-card value to every
 * revision row of the card. Reads classification inputs only — never the stored
 * ambit column — so repeated runs are idempotent. Run it after relation
 * projection completes: the projection task finalize stage, and card
 * re-projection runs.
 */
export async function deriveEntityAmbits(): Promise<DeriveAmbitsReport> {
  const db = getLocalDb();

  const entities = await db.select({
    cardId:          BaseEntity.cardId,
    type:            BaseEntity.type,
    collectible:     BaseEntity.collectible,
    inBobsTavern:    BaseEntity.inBobsTavern,
    set:             BaseEntity.set,
    mercenaryRole:   BaseEntity.mercenaryRole,
    armor:           BaseEntity.armor,
    ambit:           BaseEntity.ambit,
    heroHasRuleText: sql<boolean>`exists (
      select 1 from ${BaseEntityLocalization} loc
      where loc.card_id = ${BaseEntity.cardId}
        and loc.revision_hash = ${BaseEntity.revisionHash}
        and loc.deleted_at is null
        and loc.rich_text <> ''
    )`,
  }).from(BaseEntity).where(isNull(BaseEntity.deletedAt));

  const relations = await db.select({
    relation: BaseEntityRelation.relation,
    sourceId: BaseEntityRelation.sourceId,
    targetId: BaseEntityRelation.targetId,
  }).from(BaseEntityRelation).where(isNull(BaseEntityRelation.deletedAt));

  const ambitByCard = deriveCardAmbits(entities, relations);

  const cardIdsByAmbit = new Map<Ambit, string[]>([
    ['primary', []],
    ['additional', []],
    ['full', []],
  ]);
  let staleRows = 0;
  for (const entity of entities) {
    const target = ambitByCard.get(entity.cardId)!;
    if (entity.ambit !== target) staleRows += 1;
    cardIdsByAmbit.get(target)!.push(entity.cardId);
  }

  await db.transaction(async tx => {
    for (const [value, cardIds] of cardIdsByAmbit) {
      if (cardIds.length === 0) continue;
      for (const chunk of chunked([...new Set(cardIds)], AMBIT_WRITE_CHUNK)) {
        await tx.update(BaseEntity)
          .set({ ambit: value })
          .where(and(isNull(BaseEntity.deletedAt), inArray(BaseEntity.cardId, chunk)));
      }
    }
  });

  return { cards: ambitByCard.size, staleRows };
}
