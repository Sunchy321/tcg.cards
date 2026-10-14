import { ORPCError, os } from '@orpc/server';

import z from 'zod';
import { omit } from 'lodash-es';
import { asc, desc, eq, sql } from 'drizzle-orm';

import { announcementProfile } from '#model/magic/schema/announcement';

import { db } from '#db/db';
import { Announcement, AnnouncementItem } from '#schema/shared/magic/announcement';

const list = os
  .route({
    method:      'GET',
    description: 'Get the list of announcements',
    tags:        ['Magic', 'Announcement'],
  })
  .input(z.any())
  .output(announcementProfile.extend({ itemCount: z.number().int() }).array())
  .handler(async () => {
    const announcements = await db.select({
      id:        Announcement.id,
      source:    Announcement.source,
      date:      Announcement.date,
      name:      Announcement.name,
      itemCount: sql<number>`(SELECT count(*)::int FROM magic.announcement_items i WHERE i.announcement_id = ${Announcement.id})`,
    })
      .from(Announcement)
      .orderBy(desc(Announcement.date));

    return announcements;
  })
  .callable();

const full = os
  .route({
    method:      'GET',
    description: 'Get the full announcement by ID',
    tags:        ['Magic', 'Announcement'],
  })
  .input(z.object({ id: z.uuid() }))
  .output(z.any())
  .handler(async ({ input }) => {
    const { id } = input;

    const announcement = await db.select().from(Announcement)
      .where(eq(Announcement.id, id))
      .then(rows => rows[0]);

    if (announcement == null) {
      throw new ORPCError('NOT_FOUND');
    }

    const items = await db.select()
      .from(AnnouncementItem)
      .where(eq(AnnouncementItem.announcementId, id))
      .orderBy(asc(AnnouncementItem.order));

    return {
      ...announcement,
      createdAt: announcement.createdAt.toISOString(),
      updatedAt: announcement.updatedAt.toISOString(),
      items:     items.map(i => ({
        ...omit(i, ['id', 'announcementId']),
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      })),
    };
  })
  .callable();

export const announcementTrpc = {
  list,
  full,
};

export const announcementApi = {
  list,
  '': full,
};
