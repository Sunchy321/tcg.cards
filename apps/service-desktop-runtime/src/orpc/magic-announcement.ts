import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';

import { changeStatus, gameChangeType } from '@tcg-cards/model/magic/schema/announcement';
import { Announcement, AnnouncementItem, Card, CardPart, Print } from '@tcg-cards/db/schema/local/magic';

import { os } from './index';
import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';
import { groupCardLists } from '../lib/magic/announcement/data/card-groups';
import {
  isSentinelCardId,
  projectItem,
  type ProjectionContext,
} from '../lib/magic/announcement/projection';

const itemInput = z.object({
  type:          gameChangeType,
  effectiveDate: z.string().nullish(),
  format:        z.string().nullish(),
  status:        changeStatus.nullish(),
  score:         z.number().int().nullish(),
  group:         z.string().nullish(),
  prevVersion:   z.string().nullish(),
  delta:         z.any().nullish(),
  glow:          z.any().nullish(),
  cardId:        z.string().nullish(),
  setId:         z.string().nullish(),
  ruleId:        z.string().nullish(),
  relatedCards:  z.string().array().default([]),
});

type ItemInput = z.infer<typeof itemInput>;

function toItemRow(item: ItemInput, announcementId: string, order: number) {
  return {
    announcementId,
    order,
    type:          item.type,
    effectiveDate: item.effectiveDate ?? null,
    format:        item.format ?? null,
    status:        item.status ?? null,
    score:         item.score ?? null,
    group:         item.group ?? null,
    prevVersion:   item.prevVersion ?? null,
    delta:         item.delta ?? null,
    glow:          item.glow ?? null,
    cardId:        item.cardId ?? null,
    setId:         item.setId ?? null,
    ruleId:        item.ruleId ?? null,
    relatedCards:  item.relatedCards,
  };
}

const announcementInput = z.object({
  source:                z.string(),
  date:                  z.string(),
  name:                  z.string(),
  effectiveDate:         z.string().nullish(),
  effectiveDateTabletop: z.string().nullish(),
  effectiveDateOnline:   z.string().nullish(),
  effectiveDateArena:    z.string().nullish(),
  nextDate:              z.string().nullish(),
  prevVersion:           z.string().nullish(),
  link:                  z.array(z.object({ url: z.string(), label: z.string().optional() })).default([]),
  items:                 itemInput.array().default([]),
});

const list = os
  .input(z.any())
  .output(z.any())
  .handler(async () => {
    const db = getLocalDb();
    const announcements = await db.select({
      id:     Announcement.id,
      source: Announcement.source,
      date:   Announcement.date,
      name:   Announcement.name,
    })
      .from(Announcement)
      .orderBy(desc(Announcement.date));

    const counts = announcements.length > 0
      ? await db.select({
        announcementId: AnnouncementItem.announcementId,
        count:          sql<number>`count(*)::int`,
      })
        .from(AnnouncementItem)
        .where(inArray(AnnouncementItem.announcementId, announcements.map(a => a.id)))
        .groupBy(AnnouncementItem.announcementId)
      : [];

    const countByAnnouncement = new Map(counts.map(c => [c.announcementId, c.count]));
    return announcements.map(a => ({ ...a, itemCount: countByAnnouncement.get(a.id) ?? 0 }));
  });

const get = os
  .input(z.object({ id: z.uuid() }))
  .output(z.any())
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const row = await db.select()
      .from(Announcement)
      .where(eq(Announcement.id, input.id))
      .then(rows => rows[0]);

    if (!row) {
      throw new ORPCError('NOT_FOUND');
    }

    const items = await db.select()
      .from(AnnouncementItem)
      .where(eq(AnnouncementItem.announcementId, input.id))
      .orderBy(asc(AnnouncementItem.order));

    return {
      ...row,
      link:      row.link,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      items:     items.map(item => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    };
  });

const create = os
  .input(announcementInput)
  .output(z.any())
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const result = await db.insert(Announcement).values({
      source:                input.source,
      date:                  input.date,
      name:                  input.name,
      effectiveDate:         input.effectiveDate ?? null,
      effectiveDateTabletop: input.effectiveDateTabletop ?? null,
      effectiveDateOnline:   input.effectiveDateOnline ?? null,
      effectiveDateArena:    input.effectiveDateArena ?? null,
      nextDate:              input.nextDate ?? null,
      prevVersion:           input.prevVersion ?? null,
      link:                  input.link,
    }).returning();

    const row = result[0]!;

    if (input.items.length > 0) {
      await db.insert(AnnouncementItem).values(input.items.map((item, i) => toItemRow(item, row.id, i)));
    }

    return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  });

const update = os
  .input(announcementInput.extend({ id: z.uuid() }))
  .output(z.void())
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const { id, ...data } = input;

    await db.update(Announcement).set({
      source:                data.source,
      date:                  data.date,
      name:                  data.name,
      effectiveDate:         data.effectiveDate ?? null,
      effectiveDateTabletop: data.effectiveDateTabletop ?? null,
      effectiveDateOnline:   data.effectiveDateOnline ?? null,
      effectiveDateArena:    data.effectiveDateArena ?? null,
      nextDate:              data.nextDate ?? null,
      prevVersion:           data.prevVersion ?? null,
      link:                  data.link,
    }).where(eq(Announcement.id, id));

    // Full replace: the form edits the complete item list and rows carry no user-facing identity.
    await db.delete(AnnouncementItem).where(eq(AnnouncementItem.announcementId, id));
    if (data.items.length > 0) {
      await db.insert(AnnouncementItem).values(data.items.map((item, i) => toItemRow(item, id, i)));
    }
  });

const remove = os
  .input(z.object({ id: z.uuid() }))
  .output(z.void())
  .handler(async ({ input }) => {
    const db = getLocalDb();
    await db.delete(AnnouncementItem).where(eq(AnnouncementItem.announcementId, input.id));
    await db.delete(Announcement).where(eq(Announcement.id, input.id));
  });

/** Sentinel group card lists resolved from the database; the fixed lists come from groupCardLists. */
async function resolveGroupCards(db: NonNullable<ReturnType<typeof getLocalDb>>, groupNames: string[]): Promise<Record<string, string[]>> {
  const resolved: Record<string, string[]> = {};
  const computedNames = groupNames.filter(name => groupCardLists[name] == null);

  if (computedNames.length > 0) {
    const conspiracy = await db.select({ cardId: Card.cardId })
      .from(Card)
      .innerJoin(CardPart, and(eq(CardPart.cardId, Card.cardId), eq(CardPart.version, Card.version)))
      .where(sql`'conspiracy' = any(${CardPart.typeMain})`)
      .groupBy(Card.cardId);

    const legendary = await db.select({ cardId: Print.cardId })
      .from(Print)
      .innerJoin(CardPart, and(eq(CardPart.cardId, Print.cardId), eq(CardPart.version, Print.version)))
      .where(and(
        sql`'legendary' = any(${CardPart.typeSuper})`,
        lte(Print.releaseDate, '1995-11-01'),
      ))
      .groupBy(Print.cardId);

    resolved.conspiracy = conspiracy.map(r => r.cardId);
    resolved.legendary = legendary.map(r => r.cardId);
  }

  return Object.fromEntries(groupNames.map(name => [name, groupCardLists[name] ?? resolved[name] ?? []]));
}

const project = os
  .input(z.object({ announcementId: z.uuid() }))
  .output(z.void())
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const announcement = await db.select()
      .from(Announcement)
      .where(eq(Announcement.id, input.announcementId))
      .then(rows => rows[0]);

    if (!announcement) {
      throw new ORPCError('NOT_FOUND');
    }

    const items = await db.select()
      .from(AnnouncementItem)
      .where(eq(AnnouncementItem.announcementId, input.announcementId));

    const setIds = [...new Set(items.filter(i => i.type === 'set_change' && i.setId != null).map(i => i.setId!))];
    const setCards: Record<string, string[]> = {};
    if (setIds.length > 0) {
      const rows = await db.select({ setId: Print.set, cardId: Print.cardId })
        .from(Print)
        .where(inArray(Print.set, setIds))
        .groupBy(Print.set, Print.cardId);
      for (const row of rows) {
        (setCards[row.setId] ??= []).push(row.cardId);
      }
    }

    const groupNames = [...new Set(items
      .filter(i => i.cardId != null && isSentinelCardId(i.cardId))
      .map(i => i.cardId!.slice(1)))];
    const groupCards = await resolveGroupCards(db, groupNames);

    const sentinelCardIds = [...new Set(Object.values(groupCards).flat())];
    const cardReleaseDates: Record<string, string> = {};
    if (sentinelCardIds.length > 0) {
      const rows = await db.select({ cardId: Print.cardId, releaseDate: sql<string>`min(${Print.releaseDate})` })
        .from(Print)
        .where(inArray(Print.cardId, sentinelCardIds))
        .groupBy(Print.cardId);
      for (const row of rows) {
        cardReleaseDates[row.cardId] = row.releaseDate;
      }
    }

    const context: ProjectionContext = {
      setCards,
      groupCards,
      cardReleaseDates,
      announcementEffectiveDate: announcement.effectiveDate ?? announcement.date,
    };

    for (const item of items) {
      const projection = projectItem(item, context);
      await db.update(AnnouncementItem).set({ projection }).where(eq(AnnouncementItem.id, item.id));
    }
  });

export const magicAnnouncementRouter = {
  list,
  get,
  create,
  update,
  remove,
  project,
};
