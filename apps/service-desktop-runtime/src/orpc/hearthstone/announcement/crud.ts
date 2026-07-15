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
