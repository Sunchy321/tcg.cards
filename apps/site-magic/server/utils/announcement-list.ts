import { desc, eq, sql } from 'drizzle-orm';
import type { createDb } from '@tcg-cards/db';
import { Announcement, AnnouncementItem } from '@tcg-cards/db/schema/shared/magic/announcement';

/** Lists published announcements with their authored change counts, newest first. */
export function announcementListQuery(database: ReturnType<typeof createDb>) {
  return database.select({
    id:        Announcement.id,
    source:    Announcement.source,
    date:      Announcement.date,
    name:      Announcement.name,
    // Count the nullable joined id so announcements without changes remain zero.
    itemCount: sql<number>`count(${AnnouncementItem.id})::int`,
  })
    .from(Announcement)
    .leftJoin(AnnouncementItem, eq(AnnouncementItem.announcementId, Announcement.id))
    .groupBy(Announcement.id)
    .orderBy(desc(Announcement.date));
}
