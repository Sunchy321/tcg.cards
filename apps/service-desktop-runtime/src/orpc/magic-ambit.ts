import { z } from 'zod';
import { and, asc, count, eq, ilike, isNotNull, isNull, type SQL } from 'drizzle-orm';

import { CardAmbitOverride } from '@tcg-cards/db/schema/local/magic';
import { Card } from '@tcg-cards/db/schema/shared/magic/card';
import { ambit as ambitEnum } from '@tcg-cards/model/ambit';

import { os } from './index';
import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';
import { overrideOf, seedAmbitFor, writeCardAmbit } from '../lib/magic/ambit-write';

const overrideEntry = z.strictObject({
  ambit:     ambitEnum,
  reason:    z.string().nullable(),
  note:      z.string().nullable(),
  updatedAt: z.string(),
});

const ambitRow = z.strictObject({
  cardId:    z.string(),
  oracleId:  z.string(),
  name:      z.string(),
  typeline:  z.string(),
  category:  z.string(),
  cardAmbit: ambitEnum,
  override:  overrideEntry.nullable(),
});

const list = os
  .input(z.strictObject({
    search:       z.string().optional(),
    overrideOnly: z.boolean().default(true),
    page:         z.number().int().min(1).default(1),
    pageSize:     z.number().int().min(1).max(200).default(50),
  }))
  .output(z.strictObject({
    items:  z.array(ambitRow),
    total:  z.number(),
    counts: z.strictObject({
      overrides: z.number(),
      byAmbit:   z.array(z.strictObject({ ambit: ambitEnum, count: z.number() })),
    }),
  }))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const filters: SQL[] = [isNull(Card.deletedAt)];
    if (input.overrideOnly) filters.push(isNotNull(CardAmbitOverride.cardId));
    if (input.search != null && input.search.trim() !== '') {
      filters.push(ilike(Card.name, `%${input.search.trim()}%`));
    }
    const where = and(...filters);

    const rows = await db.select({
      cardId:          Card.cardId,
      oracleIds:       Card.scryfallOracleId,
      name:            Card.name,
      typeline:        Card.typeline,
      category:        Card.category,
      cardAmbit:       Card.ambit,
      overrideAmbit:   CardAmbitOverride.ambit,
      overrideReason:  CardAmbitOverride.reason,
      overrideNote:    CardAmbitOverride.note,
      overrideUpdated: CardAmbitOverride.updatedAt,
    }).from(Card)
      .leftJoin(CardAmbitOverride, eq(CardAmbitOverride.cardId, Card.cardId))
      .where(where)
      .orderBy(asc(Card.name))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);

    const [totalRow] = await db.select({ n: count() }).from(Card)
      .leftJoin(CardAmbitOverride, eq(CardAmbitOverride.cardId, Card.cardId))
      .where(where);
    const overrideRows = await db.select({ ambit: CardAmbitOverride.ambit, n: count() })
      .from(CardAmbitOverride)
      .groupBy(CardAmbitOverride.ambit);

    return {
      items: rows.map(row => ({
        cardId:    row.cardId,
        oracleId:  row.oracleIds[0] ?? '',
        name:      row.name,
        typeline:  row.typeline,
        category:  row.category,
        cardAmbit: row.cardAmbit,
        override:  row.overrideAmbit == null
          ? null
          : {
            ambit:     row.overrideAmbit,
            reason:    row.overrideReason,
            note:      row.overrideNote,
            updatedAt: row.overrideUpdated!.toISOString(),
          },
      })),
      total:  Number(totalRow?.n ?? 0),
      counts: {
        overrides: Number(overrideRows.reduce((sum, r) => sum + Number(r.n), 0)),
        byAmbit:   overrideRows.map(r => ({ ambit: r.ambit, count: Number(r.n) })),
      },
    };
  });

/** Stores or replaces the card's override and writes the ambit through to the fact rows. */
const set = os
  .input(z.strictObject({
    cardId: z.string().min(1),
    ambit:  ambitEnum,
    reason: z.string().nullable().optional(),
    note:   z.string().nullable().optional(),
  }))
  .output(z.strictObject({
    cardAmbit: ambitEnum,
    seedAmbit: ambitEnum,
  }))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const card = await db.select({ oracleIds: Card.scryfallOracleId })
      .from(Card)
      .where(and(eq(Card.cardId, input.cardId), isNull(Card.deletedAt)))
      .then(rows => rows[0]);
    if (card == null) throw new Error('卡牌不存在');
    if (card.oracleIds.length === 0) throw new Error('该卡没有 scryfall oracle 来源，无法计算分类种子');

    const seed = await seedAmbitFor(db, card.oracleIds[0]!);

    await db.insert(CardAmbitOverride).values({
      cardId: input.cardId,
      ambit:  input.ambit,
      reason: input.reason ?? null,
      note:   input.note ?? null,
    }).onConflictDoUpdate({
      target: CardAmbitOverride.cardId,
      set:    {
        ambit:  input.ambit,
        reason: input.reason ?? null,
        note:   input.note ?? null,
      },
    });

    await writeCardAmbit(db, input.cardId, input.ambit);

    return { cardAmbit: input.ambit, seedAmbit: seed.ambit };
  });

/** Withdraws the card's override: the row is deleted and the card returns to
 * its classification seed immediately, matching the next projection run. */
const remove = os
  .input(z.strictObject({ cardId: z.string().min(1) }))
  .output(z.strictObject({
    removed:   z.boolean(),
    cardAmbit: ambitEnum,
  }))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const existing = await overrideOf(db, input.cardId);
    if (existing == null) {
      const current = await db.select({ ambit: Card.ambit }).from(Card)
        .where(and(eq(Card.cardId, input.cardId), isNull(Card.deletedAt)))
        .then(rows => rows[0]);
      if (current == null) throw new Error('卡牌不存在');
      return { removed: false, cardAmbit: current.ambit };
    }

    const card = await db.select({ oracleIds: Card.scryfallOracleId }).from(Card)
      .where(and(eq(Card.cardId, input.cardId), isNull(Card.deletedAt)))
      .then(rows => rows[0]);
    if (card == null || card.oracleIds.length === 0) throw new Error('该卡没有 scryfall oracle 来源，无法计算分类种子');

    const seed = await seedAmbitFor(db, card.oracleIds[0]!);

    await db.delete(CardAmbitOverride).where(eq(CardAmbitOverride.cardId, input.cardId));
    await writeCardAmbit(db, input.cardId, seed.ambit);

    return { removed: true, cardAmbit: seed.ambit };
  });

export const magicAmbitRouter = {
  list,
  set,
  remove,
};
