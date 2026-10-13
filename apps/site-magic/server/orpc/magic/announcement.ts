import { ORPCError, os } from '@orpc/server';

import z from 'zod';
import { omit } from 'lodash-es';
import { asc, desc, eq } from 'drizzle-orm';

// import { AnnouncementApplier } from '@/magic/banlist/apply';

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

const save = os
  // Write contract is undefined until this endpoint gains its first consumer;
  // the model shape requires client-side timestamps nothing can supply yet.
  .input(z.any())
  .output(z.void())
  .handler(async ({ input }) => {
    const data = input as {
      id:                     string;
      source:                 string;
      date:                   string;
      name:                   string;
      effectiveDate?:         string | null;
      effectiveDateTabletop?: string | null;
      effectiveDateOnline?:   string | null;
      effectiveDateArena?:    string | null;
      nextDate?:              string | null;
      link:                   { url: string, label?: string }[];
      items:                  Record<string, unknown>[];
    };

    const existing = data.id !== ''
      ? await db.select().from(Announcement)
        .where(eq(Announcement.id, data.id))
        .then(rows => rows[0])
      : null;

    let id = data.id;

    if (existing != null) {
      await db.update(Announcement)
        .set({
          source: data.source,
          date:   data.date,
          name:   data.name,

          effectiveDate:         data.effectiveDate ?? null,
          effectiveDateTabletop: data.effectiveDateTabletop ?? null,
          effectiveDateOnline:   data.effectiveDateOnline ?? null,
          effectiveDateArena:    data.effectiveDateArena ?? null,

          nextDate: data.nextDate ?? null,

          link: data.link,
        })
        .where(eq(Announcement.id, data.id));
    } else {
      id = await db
        .insert(Announcement)
        .values(omit(data, ['id', 'items']))
        .returning()
        .then(ret => ret[0]!.id);
    }

    await db.delete(AnnouncementItem)
      .where(eq(AnnouncementItem.announcementId, id));

    for (const [i, item] of data.items.entries()) {
      await db.insert(AnnouncementItem).values({
        announcementId: id,
        ...item,
        order:          i,
      } as typeof AnnouncementItem.$inferInsert);
    }
  });

// const apply = os
//   .input(z.void())
//   .output(z.void())
//   .handler(async () => {
//     const applier = new AnnouncementApplier();

//     await applier.apply();
//   });

export const announcementTrpc = {
  list,
  full,
  save,
  // apply,
};

export const announcementApi = {
  list,
  '': full,
};
