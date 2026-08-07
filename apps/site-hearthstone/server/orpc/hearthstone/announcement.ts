import { os } from '@orpc/server';
import z from 'zod';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { announcementItem, announcementProfile } from '#model/hearthstone/schema/announcement';
import type { GlowEntry } from '#model/hearthstone/schema/announcement';
import { locale } from '#model/hearthstone/schema/basic';

import { db } from '#db/db';
import { Announcement, AnnouncementItem } from '#schema/shared/hearthstone';

import { resolveAnnouncementItemImages, type AnnouncementImageItem } from './announcement-image';

const announcementItemWithImages = announcementItem.extend({
  date:   z.string().nullable(),
  name:   z.string().nullable(),
  images: z.array(z.object({
    side:     z.string(),
    hash:     z.string(),
    category: z.string(),
    template: z.string(),
  })),
});

const list = os
  .route({
    method:      'GET',
    description: 'List announcements with item counts',
    tags:        ['Hearthstone', 'Announcement'],
  })
  .input(z.any())
  .output(announcementProfile.array())
  .handler(async () => {
    const rows = await db
      .select()
      .from(Announcement)
      .orderBy(desc(Announcement.date))
      .catch(error => {
        if (isMissingTable(error)) return [];
        throw error;
      });

    return rows.map(row => ({
      id:     row.id,
      source: row.source,
      date:   row.date,
      name:   row.name,
    }));
  });

const get = os
  .route({
    method:      'GET',
    description: 'Get announcement with items',
    tags:        ['Hearthstone', 'Announcement'],
  })
  .input(z.object({ id: z.uuid(), lang: locale.optional().default('zhs') }))
  .output(z.any())
  .handler(async ({ input }) => {
    const row = await db
      .select()
      .from(Announcement)
      .where(eq(Announcement.id, input.id))
      .then(rows => rows[0]);

    if (!row) return null;

    const items = await db
      .select()
      .from(AnnouncementItem)
      .where(eq(AnnouncementItem.announcementId, input.id))
      .orderBy(asc(AnnouncementItem.order));

    const images = await resolveAnnouncementItemImages(
      items.map(item => ({
        id:                      item.id,
        type:                    item.type,
        cardId:                  item.cardId,
        format:                  item.format,
        version:                 item.version,
        lastVersion:             item.lastVersion,
        delta:                   item.delta as { prev?: Record<string, unknown>, curr?: Record<string, unknown> } | null,
        glow:                    item.glow as GlowEntry[] | null,
        announcementVersion:     row.version,
        announcementLastVersion: row.lastVersion,
      })),
      input.lang,
    );

    return {
      ...row,
      link:  row.link as { url: string, label?: string }[],
      items: items.map(item => ({
        ...item,
        glow:   item.glow as GlowEntry[] | null,
        delta:  item.delta as Record<string, unknown> | null,
        images: images.get(item.id) ?? [],
      })),
    };
  });

const timeline = os
  .route({
    method:      'GET',
    description: 'Get announcement items for a format',
    tags:        ['Hearthstone', 'Announcement'],
  })
  .input(z.object({ format: z.string(), lang: locale.optional().default('zhs') }))
  .output(announcementItemWithImages.array())
  .handler(async ({ input }) => {
    const rows = await db
      .select({ item: AnnouncementItem })
      .from(AnnouncementItem)
      .innerJoin(Announcement, eq(Announcement.id, AnnouncementItem.announcementId))
      .where(sql`(${AnnouncementItem.projection}->'formats') @> ${JSON.stringify([input.format])}::jsonb`)
      .orderBy(desc(Announcement.date))
      .orderBy(asc(AnnouncementItem.order));

    const annMap = await announcementContexts(rows);
    const images = await resolveAnnouncementItemImages(
      rows.map(({ item }) => imageItem(item, annMap)),
      input.lang,
    );

    return rows.map(({ item }) => ({
      ...item,
      date:      annMap.get(item.announcementId)?.date ?? null,
      name:      annMap.get(item.announcementId)?.name ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      glow:      item.glow as GlowEntry[] | null,
      delta:     item.delta as Record<string, unknown> | null,
      images:    images.get(item.id) ?? [],
    }));
  });

const cardHistory = os
  .route({
    method:      'GET',
    description: 'Get announcement items for a card',
    tags:        ['Hearthstone', 'Announcement'],
  })
  .input(z.object({ cardId: z.string(), lang: locale.optional().default('zhs') }))
  .output(announcementItemWithImages.array())
  .handler(async ({ input }) => {
    const rows = await db
      .select({ item: AnnouncementItem })
      .from(AnnouncementItem)
      .innerJoin(Announcement, eq(Announcement.id, AnnouncementItem.announcementId))
      .where(sql`(${AnnouncementItem.projection}->'cards') @> ${JSON.stringify([input.cardId])}::jsonb`)
      .orderBy(desc(Announcement.date))
      .orderBy(asc(AnnouncementItem.order));

    const annMap = await announcementContexts(rows);
    const images = await resolveAnnouncementItemImages(
      rows.map(({ item }) => imageItem(item, annMap)),
      input.lang,
    );

    return rows.map(({ item }) => ({
      ...item,
      date:      annMap.get(item.announcementId)?.date ?? null,
      name:      annMap.get(item.announcementId)?.name ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      glow:      item.glow as GlowEntry[] | null,
      delta:     item.delta as Record<string, unknown> | null,
      images:    images.get(item.id) ?? [],
    }));
  });

type AnnouncementContext = { date: string | null, name: string | null, version: number, lastVersion: number | null };

/** Batch-loads announcement date/version context for each item's announcement. */
async function announcementContexts(
  rows: Array<{ item: typeof AnnouncementItem.$inferSelect }>,
): Promise<Map<string, AnnouncementContext>> {
  const ids = [...new Set(rows.map(row => row.item.announcementId))];
  const annRows = await db
    .select({ id: Announcement.id, date: Announcement.date, name: Announcement.name, version: Announcement.version, lastVersion: Announcement.lastVersion })
    .from(Announcement)
    .where(inArray(Announcement.id, ids));
  return new Map(annRows.map(ann => [ann.id, ann]));
}

/** Builds the image-enrichment input for one item using its announcement context. */
function imageItem(
  item: typeof AnnouncementItem.$inferSelect,
  annMap: Map<string, AnnouncementContext>,
): AnnouncementImageItem {
  return {
    id:                      item.id,
    type:                    item.type,
    cardId:                  item.cardId,
    format:                  item.format,
    version:                 item.version,
    lastVersion:             item.lastVersion,
    delta:                   item.delta as { prev?: Record<string, unknown>, curr?: Record<string, unknown> } | null,
    glow:                    item.glow as GlowEntry[] | null,
    announcementVersion:     annMap.get(item.announcementId)?.version ?? 0,
    announcementLastVersion: annMap.get(item.announcementId)?.lastVersion ?? null,
  };
}

export const announcementTrpc = {
  list,
  get,
  timeline,
  cardHistory,
};

export const announcementApi = {
  list,
  get,
  timeline,
  cardHistory,
};

function isMissingTable(error: unknown): boolean {
  if (typeof error !== 'object' || error == null) return false;
  if ('code' in error && error.code === '42P01') return true;
  if ('message' in error && typeof error.message === 'string' && error.message.includes('hearthstone.announcements')) return true;
  return 'cause' in error && isMissingTable(error.cause);
}
