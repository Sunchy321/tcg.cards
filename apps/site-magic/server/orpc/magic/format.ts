import { ORPCError, os } from '@orpc/server';

import { z } from 'zod';
import { and, asc, eq, isNotNull, or, sql } from 'drizzle-orm';

import { format as formatSchema } from '#model/magic/schema/format';
import { announcementItem, linkEntry } from '#model/magic/schema/announcement';

import { db } from '#db/db';
import { Announcement, AnnouncementItem } from '#schema/shared/magic/announcement';
import { Format } from '#schema/shared/magic/format';

/**
 * One format change event projected from announcements:
 * an announcement item that applies to a format, carrying the announcement header.
 * Mirrors the hearthstone timeline view (announcement item + header fields).
 */
const formatChange = announcementItem.extend({
  /** Derived event date: item effectiveDate ?? announcement effectiveDate ?? announcement date. */
  date:   z.string(),
  source: z.string(),
  name:   z.string(),
  link:   linkEntry.array(),
});

type FormatChange = z.infer<typeof formatChange>;

const list = os
  .route({
    method:      'GET',
    description: 'Get list of formats',
    tags:        ['Magic', 'Format'],
  })
  .input(z.any())
  .output(z.string().array())
  .handler(async () => {
    const formats = await db.select({ formatId: Format.formatId })
      .from(Format);

    return formats.map(f => f.formatId);
  });

const full = os
  .route({
    method:      'GET',
    description: 'Get full format info',
    tags:        ['Magic', 'Format'],
  })
  .input(z.object({ formatId: z.string() }))
  .output(formatSchema)
  .handler(async ({ input }) => {
    const { formatId } = input;

    const fmt = await db.select()
      .from(Format)
      .where(eq(Format.formatId, formatId))
      .then(rows => rows[0]);

    if (fmt == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return {
      formatId:     fmt.formatId,
      localization: fmt.localization,
      sets:         fmt.sets,
      banlist:      fmt.banlist,
      birthday:     fmt.birthday ?? null,
      deathdate:    fmt.deathdate ?? null,
      tags:         fmt.tags,
    };
  });

const changes = os
  .route({
    method:      'GET',
    description: 'Get format changes (announcement items) ordered by date',
    tags:        ['Magic', 'Format'],
  })
  .input(z.object({ formatId: z.string() }))
  .output(formatChange.array())
  .handler(async ({ input }) => {
    const { formatId } = input;

    const rows = await db
      .select({
        item: AnnouncementItem,
        announcement: {
          date:         Announcement.date,
          effectiveDate: Announcement.effectiveDate,
          source:       Announcement.source,
          name:         Announcement.name,
          link:         Announcement.link,
        },
      })
      .from(AnnouncementItem)
      .innerJoin(Announcement, eq(Announcement.id, AnnouncementItem.announcementId))
      // Match the format either by the raw item.format value or by the projected
      // resolved_formats array. Global (format IS NULL) items stay excluded.
      .where(and(
        isNotNull(AnnouncementItem.format),
        or(
          eq(AnnouncementItem.format, formatId),
          sql`${AnnouncementItem.resolved_formats} @> ARRAY[${formatId}]::text[]`,
        ),
      ))
      .orderBy(asc(Announcement.date), asc(AnnouncementItem.order));

    return rows
      .map(({ item, announcement }) => ({
        ...item,
        type:      item.type as FormatChange['type'],
        status:    item.status as FormatChange['status'],
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),

        date:   item.effectiveDate ?? announcement.effectiveDate ?? announcement.date,
        source: announcement.source,
        name:   announcement.name,
        link:   announcement.link,
      }))
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order);
  });

export const formatTrpc = {
  list,
  full,
  changes,
};

export const formatApi = {
  '': full,
  list,
  changes,
};
