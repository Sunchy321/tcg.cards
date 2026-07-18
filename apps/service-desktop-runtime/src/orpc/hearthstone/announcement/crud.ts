// Adapted from packages/console-api/src/orpc/hearthstone/announcement.ts
// to use getLocalDb() instead of @tcg-cards/db/db.

import { ORPCError, os } from '@orpc/server';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';

import { Announcement, AnnouncementItem } from '@tcg-cards/db/schema/local/hearthstone';

import { getLocalDb } from '../../../lib/hearthstone/hsdata-local-db';

const FORMAT_KEYWORD_MAP: Record<string, string[]> = {
  standard:    ['standard'],
  wild:        ['wild'],
  constructed: ['standard', 'wild'],
  twist:       ['twist'],
  mercenaries: ['mercenaries'],
};

function resolveFormats(format: string | null): string[] {
  if (!format) return [];
  return FORMAT_KEYWORD_MAP[format] ?? [format];
}

function resolveCards(cardId: string | null, relatedCards: string[]): string[] {
  const ids = new Set<string>();
  if (cardId) ids.add(cardId);
  for (const id of relatedCards) ids.add(id);
  return [...ids];
}

const list = os
  .route({
    method: 'GET', description: 'Get the list of announcements',
    tags: ['Desktop', 'Hearthstone', 'Announcement'],
  })
  .input(z.any())
  .output(z.any())
  .handler(async () => {
    const db = getLocalDb();
    return db.select({
      id: Announcement.id, source: Announcement.source,
      date: Announcement.date, name: Announcement.name,
    })
      .from(Announcement)
      .orderBy(desc(Announcement.date));
  });

const get = os
  .route({
    method: 'GET', description: 'Get announcement by ID',
    tags: ['Desktop', 'Hearthstone', 'Announcement'],
  })
  .input(z.object({ id: z.uuid() }))
  .output(z.any())
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const row = await db.select().from(Announcement).where(eq(Announcement.id, input.id)).then(r => r[0]);
    if (!row) throw new ORPCError('NOT_FOUND');
    const items = await db.select().from(AnnouncementItem).where(eq(AnnouncementItem.announcementId, input.id));
    return {
      ...row,
      link: row.link,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      items: items.map(item => ({
        ...item,
        glow: item.glow, delta: item.delta,
        createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
      })),
    };
  });

const itemInput = z.object({
  type:          z.string(),
  effectiveDate: z.string().nullable().optional(),
  format:        z.string().nullable().optional(),
  status:        z.string().nullable().optional(),
  score:         z.number().int().nullable().optional(),
  group:         z.string().nullable().optional(),
  version:       z.number().int().nullable().optional(),
  lastVersion:   z.number().int().nullable().optional(),
  delta:         z.any().nullable().optional(),
  glow:          z.any().nullable().optional(),
  cardId:        z.string().nullable().optional(),
  setId:         z.string().nullable().optional(),
  ruleId:        z.string().nullable().optional(),
  relatedCards:  z.string().array().default([]),
});

type ItemInput = z.infer<typeof itemInput>;

function toItemRow(item: ItemInput, announcementId: string) {
  return {
    announcementId,
    type:          item.type,
    effectiveDate: item.effectiveDate ?? null,
    format:        item.format ?? null,
    status:        item.status ?? null,
    score:         item.score ?? null,
    group:         item.group ?? null,
    version:       item.version ?? null,
    lastVersion:   item.lastVersion ?? null,
    delta:         item.delta ?? null,
    glow:          item.glow ?? null,
    cardId:        item.cardId ?? null,
    setId:         item.setId ?? null,
    ruleId:        item.ruleId ?? null,
    relatedCards:  item.relatedCards,
  };
}

const create = os
  .route({
    method: 'POST', description: 'Create a new announcement',
    tags: ['Desktop', 'Hearthstone', 'Announcement'],
  })
  .input(z.object({
    source: z.string(), date: z.string(), name: z.string(),
    version: z.number().int(), lastVersion: z.number().int().nullable().optional(),
    effectiveDate: z.string().nullable().optional(),
    link: z.array(z.object({ url: z.string(), label: z.string().optional() })).default([]),
    items: itemInput.array().default([]),
  }))
  .output(z.any())
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const result = await db.insert(Announcement).values({
      source: input.source, date: input.date, name: input.name,
      version: input.version, lastVersion: input.lastVersion,
      effectiveDate: input.effectiveDate ?? null, link: input.link,
    }).returning();
    const row = result[0]!;

    if (input.items.length > 0) {
      await db.insert(AnnouncementItem).values(input.items.map(item => toItemRow(item, row.id)));
    }

    return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  });

const update = os
  .route({
    method: 'PUT', description: 'Update an announcement',
    tags: ['Desktop', 'Hearthstone', 'Announcement'],
  })
  .input(z.object({
    id: z.uuid(), source: z.string(), date: z.string(), name: z.string(),
    version: z.number().int(), lastVersion: z.number().int().nullable().optional(),
    effectiveDate: z.string().nullable().optional(),
    link: z.array(z.object({ url: z.string(), label: z.string().optional() })).default([]),
    items: itemInput.array().default([]),
  }))
  .output(z.void())
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const { id, ...data } = input;
    await db.update(Announcement).set({
      source: data.source, date: data.date, name: data.name,
      version: data.version, lastVersion: data.lastVersion,
      effectiveDate: data.effectiveDate ?? null, link: data.link,
    }).where(eq(Announcement.id, id));

    // Full replace: the form edits the complete item list and rows carry no user-facing identity.
    await db.delete(AnnouncementItem).where(eq(AnnouncementItem.announcementId, id));
    if (data.items.length > 0) {
      await db.insert(AnnouncementItem).values(data.items.map(item => toItemRow(item, id)));
    }
  });

const remove = os
  .route({
    method: 'DELETE', description: 'Delete an announcement',
    tags: ['Desktop', 'Hearthstone', 'Announcement'],
  })
  .input(z.object({ id: z.uuid() }))
  .output(z.void())
  .handler(async ({ input }) => {
    const db = getLocalDb();
    await db.delete(AnnouncementItem).where(eq(AnnouncementItem.announcementId, input.id));
    await db.delete(Announcement).where(eq(Announcement.id, input.id));
  });

const projectItems = os
  .route({
    method: 'POST', description: 'Run projection on all items of an announcement',
    tags: ['Desktop', 'Hearthstone', 'Announcement'],
  })
  .input(z.object({ announcementId: z.uuid() }))
  .output(z.void())
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const items = await db.select().from(AnnouncementItem).where(eq(AnnouncementItem.announcementId, input.announcementId));
    for (const item of items) {
      await db.update(AnnouncementItem).set({
        resolvedFormats: resolveFormats(item.format),
        resolvedCards: resolveCards(item.cardId, item.relatedCards),
      }).where(eq(AnnouncementItem.id, item.id));
    }
  });

export const announcementCrudRouter = {
  list,
  get,
  create,
  update,
  remove,
  project: projectItems,
};
