import { os } from '@orpc/server';

import z from 'zod';
import { desc } from 'drizzle-orm';

import { defineFactTable } from '../factory';

import { db } from '@tcg-cards/db';
import { Announcement } from '@tcg-cards/db/schema/shared/magic/announcement';
import { announcement } from '@tcg-cards/model/src/magic/schema/announcement';

type AnnouncementRow = {
  id:            string;
  source:        string;
  date:          string;
  name:          string;
  effectiveDate: string | null;
  link:          { url: string, label?: string }[];
  createdAt:     Date;
  updatedAt:     Date;
};

const toAnnouncement = (r: AnnouncementRow) => ({
  id:            r.id,
  source:        r.source,
  date:          r.date,
  name:          r.name,
  effectiveDate: r.effectiveDate ?? null,
  link:          r.link,
  createdAt:     r.createdAt.toISOString(),
  updatedAt:     r.updatedAt.toISOString(),
});

export const list = os
  .route({
    method:      'GET',
    description: 'List announcements ordered by date descending',
    tags:        ['Magic', 'Announcement'],
  })
  .output(announcement.array())
  .handler(async () => {
    const rows = await db.select().from(Announcement).orderBy(desc(Announcement.date));

    return rows.map(toAnnouncement);
  });

export const detail = defineFactTable({
  description: 'Get an announcement by id',
  tags:        ['Magic', 'Announcement'],
  table:       Announcement,
  pk:          { id: { column: Announcement.id, schema: z.string() } },
  output:      announcement,
  map:         toAnnouncement,
});

export const announcementRouter = { list, detail };
