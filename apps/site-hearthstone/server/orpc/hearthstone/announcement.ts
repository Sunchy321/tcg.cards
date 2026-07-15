import { os } from '@orpc/server';
import z from 'zod';
import { desc, eq, sql } from 'drizzle-orm';

import { announcementItem, announcementProfile } from '#model/hearthstone/schema/announcement';

import { db } from '#db/db';
import { Announcement, AnnouncementItem } from '#schema/shared/hearthstone';

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
      ...row,
      link: row.link as { url: string, label?: string }[],
    }));
  });

const get = os
  .route({
    method:      'GET',
    description: 'Get announcement with items',
    tags:        ['Hearthstone', 'Announcement'],
  })
  .input(z.object({ id: z.uuid() }))
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
      .where(eq(AnnouncementItem.announcementId, input.id));

    return {
      ...row,
      link:  row.link as { url: string, label?: string }[],
      items: items.map(item => ({
        ...item,
        glow:  item.glow as { part: string, type: 'buff' | 'nerf' }[] | null,
        delta: item.delta as Record<string, unknown> | null,
      })),
    };
  });

const timeline = os
  .route({
    method:      'GET',
    description: 'Get announcement items for a format',
    tags:        ['Hearthstone', 'Announcement'],
  })
  .input(z.object({
    format: z.string(),
  }))
  .output(announcementItem.array())
  .handler(async ({ input }) => {
    const items = await db
      .select()
      .from(AnnouncementItem)
      .where(sql`${input.format} = ANY(${AnnouncementItem.formats})`)
      .orderBy(desc(AnnouncementItem.date));

    return items.map(item => ({
      ...item,
      glow:  item.glow as { part: string, type: 'buff' | 'nerf' }[] | null,
      delta: item.delta as Record<string, unknown> | null,
    }));
  });

const cardHistory = os
  .route({
    method:      'GET',
    description: 'Get announcement items for a card',
    tags:        ['Hearthstone', 'Announcement'],
  })
  .input(z.object({
    cardId: z.string(),
  }))
  .output(announcementItem.array())
  .handler(async ({ input }) => {
    const items = await db
      .select()
      .from(AnnouncementItem)
      .where(sql`${input.cardId} = ANY(${AnnouncementItem.cardIds})`)
      .orderBy(desc(AnnouncementItem.date));

    return items.map(item => ({
      ...item,
      glow:  item.glow as { part: string, type: 'buff' | 'nerf' }[] | null,
      delta: item.delta as Record<string, unknown> | null,
    }));
  });

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
