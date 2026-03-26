import { ORPCError, os } from '@orpc/server';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';

import { announcementProfile } from '#model/magic/schema/announcement';

import { db } from '#db/db';
import { Announcement, AnnouncementItem } from '#schema/magic/announcement';

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
  .output(z.object({
    id:            z.uuid(),
    source:        z.string(),
    date:          z.string(),
    name:          z.string(),
    effectiveDate: z.string().nullable(),
    link:          z.string().array(),
    items:         z.array(z.object({
      id:            z.uuid(),
      type:          z.string(),
      effectiveDate: z.string().nullable(),
      format:        z.string().nullable(),
      cardId:        z.string().nullable(),
      setId:         z.string().nullable(),
      ruleId:        z.string().nullable(),
      status:        z.string().nullable(),
      score:         z.number().nullable(),
    })),
  }))
  .handler(async ({ input }) => {
    const { id } = input;

    const announcement = await db.select()
      .from(Announcement)
      .where(eq(Announcement.id, id))
      .then(rows => rows[0]);

    if (!announcement) {
      throw new ORPCError('NOT_FOUND', 'Announcement not found');
    }

    const items = await db.select({
      id: AnnouncementItem.id,
      type: AnnouncementItem.type,
      effectiveDate: AnnouncementItem.effectiveDate,
      format: AnnouncementItem.format,
      cardId: AnnouncementItem.cardId,
      setId: AnnouncementItem.setId,
      ruleId: AnnouncementItem.ruleId,
      status: AnnouncementItem.status,
      score: AnnouncementItem.score,
    })
      .from(AnnouncementItem)
      .where(eq(AnnouncementItem.announcementId, id));

    return {
      ...announcement,
      items,
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
    link:          z.string().array(),
  }))
  .output(z.object({
    id:            z.uuid(),
    source:        z.string(),
    date:          z.string(),
    name:          z.string(),
    effectiveDate: z.string().nullable().optional(),
    link:          z.string().array(),
  }))
  .handler(async ({ input }) => {
    const result = await db
      .insert(Announcement)
      .values({
        source: input.source,
        date:   input.date,
        name:   input.name,
        effectiveDate: input.effectiveDate ?? null,
        link:   input.link,
      })
      .returning();

    return result[0]!;
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
    link:          z.string().array(),
  }))
  .output(z.void())
  .handler(async ({ input }) => {
    const { id, ...data } = input;

    const existing = await db.select()
      .from(Announcement)
      .where(eq(Announcement.id, id))
      .then(rows => rows[0]);

    if (!existing) {
      throw new ORPCError('NOT_FOUND', 'Announcement not found');
    }

    await db.update(Announcement)
      .set({
        source: data.source,
        date:   data.date,
        name:   data.name,
        effectiveDate: data.effectiveDate ?? null,
        link:   data.link,
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

    // Delete related items first
    await db.delete(AnnouncementItem)
      .where(eq(AnnouncementItem.announcementId, id));

    // Delete announcement
    await db.delete(Announcement)
      .where(eq(Announcement.id, id));
  })
  .callable();

export const announcementTrpc = {
  list,
  get,
  create,
  update,
  remove,
};
