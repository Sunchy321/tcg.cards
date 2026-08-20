import { ORPCError } from '@orpc/server';

import { desc, eq } from 'drizzle-orm';

import { os } from '../../orpc';

import { db } from '@tcg-cards/db';
import { Announcement } from '@tcg-cards/db/schema/shared/magic/announcement';

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

const list = os.magic.announcement.list
  .handler(async () => {
    const rows = await db.select().from(Announcement).orderBy(desc(Announcement.date));

    return rows.map(toAnnouncement);
  });

const detail = os.magic.announcement.detail
  .handler(async ({ input }) => {
    const row = await db.select()
      .from(Announcement)
      .where(eq(Announcement.id, input.id))
      .then(rows => rows[0]);

    if (row == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return toAnnouncement(row as AnnouncementRow);
  });

export const announcement = { list, detail };
