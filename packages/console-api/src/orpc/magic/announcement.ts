import { ORPCError, os } from '@orpc/server';
import { z } from 'zod';
import { asc, desc, eq } from 'drizzle-orm';

import { db } from '@tcg-cards/db/db';
import { Announcement, AnnouncementItem } from '@tcg-cards/db/schema/shared/magic';
import {
  announcementProfile,
} from '@tcg-cards/model/src/magic/schema/announcement';

const FORMAT_KEYWORD_MAP: Record<string, string[]> = {};

function projectFormats(format: string | null): string[] {
  if (!format) return [];
  return FORMAT_KEYWORD_MAP[format] ?? [format];
}

function projectCardIds(cardId: string | null, relatedCards: string[]): string[] {
  const ids = new Set<string>();
  if (cardId) ids.add(cardId);
  for (const id of relatedCards) ids.add(id);
  return [...ids];
}

const list = os
  .route({
    method:      'GET',
    description: 'Get the list of announcements',
    tags:        ['Console', 'Magic', 'Announcement'],
  })
  .input(z.any())
  .output(announcementProfile.array())
  .handler(async () => {
    const announcements = await db.select({
      id:     Announcement.id,
      source: Announcement.source,
      date:   Announcement.date,
      name:   Announcement.name,
    })
      .from(Announcement)
      .orderBy(desc(Announcement.date));

    return announcements;
  })
  .callable();

const get = os
  .route({
    method:      'GET',
    description: 'Get announcement by ID',
    tags:        ['Console', 'Magic', 'Announcement'],
  })
  .input(z.object({ id: z.uuid() }))
  .output(z.any())
  .handler(async ({ input }) => {
    const { id } = input;

    const row = await db.select()
      .from(Announcement)
      .where(eq(Announcement.id, id))
      .then(rows => rows[0]);

    if (!row) {
      throw new ORPCError('NOT_FOUND', { message: 'Announcement not found' });
    }

    const items = await db.select()
      .from(AnnouncementItem)
      .where(eq(AnnouncementItem.announcementId, id))
      .orderBy(asc(AnnouncementItem.order));

    return {
      ...row,
      link:       row.link as { url: string; label?: string }[],
      createdAt:  row.createdAt.toISOString(),
      updatedAt:  row.updatedAt.toISOString(),
      items:      items.map(item => ({
        ...item,
        glow:      item.glow as { part: string; type: 'buff' | 'nerf' }[] | null,
        delta:     item.delta as Record<string, unknown> | null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    };
  })
  .callable();

const create = os
  .route({
    method:      'POST',
    description: 'Create a new announcement',
    tags:        ['Console', 'Magic', 'Announcement'],
  })
  .input(z.object({
    source:        z.string(),
    date:          z.string(),
    name:          z.string(),
    effectiveDate: z.string().nullable().optional(),
    link:          z.array(z.object({
      url:   z.string(),
      label: z.string().optional(),
    })).default([]),
  }))
  .output(z.any())
  .handler(async ({ input }) => {
    const result = await db
      .insert(Announcement)
      .values({
        source:        input.source,
        date:          input.date,
        name:          input.name,
        effectiveDate: input.effectiveDate ?? null,
        link:          input.link,
      })
      .returning();

    const row = result[0]!;
    return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  })
  .callable();

const update = os
  .route({
    method:      'PUT',
    description: 'Update an announcement',
    tags:        ['Console', 'Magic', 'Announcement'],
  })
  .input(z.object({
    id:            z.uuid(),
    source:        z.string(),
    date:          z.string(),
    name:          z.string(),
    effectiveDate: z.string().nullable().optional(),
    link:          z.array(z.object({
      url:   z.string(),
      label: z.string().optional(),
    })).default([]),
  }))
  .output(z.void())
  .handler(async ({ input }) => {
    const { id, ...data } = input;

    const existing = await db.select()
      .from(Announcement)
      .where(eq(Announcement.id, id))
      .then(rows => rows[0]);

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Announcement not found' });
    }

    await db.update(Announcement)
      .set({
        source:        data.source,
        date:          data.date,
        name:          data.name,
        effectiveDate: data.effectiveDate ?? null,
        link:          data.link,
      })
      .where(eq(Announcement.id, id));
  })
  .callable();

const remove = os
  .route({
    method:      'DELETE',
    description: 'Delete an announcement',
    tags:        ['Console', 'Magic', 'Announcement'],
  })
  .input(z.object({
    id: z.uuid(),
  }))
  .output(z.void())
  .handler(async ({ input }) => {
    const { id } = input;

    await db.delete(AnnouncementItem)
      .where(eq(AnnouncementItem.announcementId, id));

    await db.delete(Announcement)
      .where(eq(Announcement.id, id));
  })
  .callable();

const projectItems = os
  .route({
    method:      'POST',
    description: 'Run projection on all items of an announcement',
    tags:        ['Console', 'Magic', 'Announcement'],
  })
  .input(z.object({
    announcementId: z.uuid(),
  }))
  .output(z.void())
  .handler(async ({ input }) => {
    const items = await db.select()
      .from(AnnouncementItem)
      .where(eq(AnnouncementItem.announcementId, input.announcementId));

    for (const item of items) {
      const result = project({
        format:       item.format,
        cardId:       item.cardId,
        relatedCards: item.relatedCards,
        game:         'magic',
      });

      await db.update(AnnouncementItem)
        .set({
          formats: result.formats,
          cardIds: result.cardIds,
        })
        .where(eq(AnnouncementItem.id, item.id));
    }
  })
  .callable();

export const announcementTrpc = {
  list,
  get,
  create,
  update,
  remove,
  project: projectItems,
};
