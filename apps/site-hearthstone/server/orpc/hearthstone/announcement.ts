import { os } from '@orpc/server';
import z from 'zod';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { announcementItem } from '#model/hearthstone/schema/announcement';
import type { GlowEntry } from '#model/hearthstone/schema/announcement';
import { locale, type Locale } from '#model/hearthstone/schema/basic';

import { db } from '#db/db';
import { Announcement, AnnouncementItem, EntityLocalization, SetLocalization } from '#schema/shared/hearthstone';

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
  cardName:          z.string().nullable(),
  relatedCardNames:  z.array(z.string()),
  relatedCardHashes: z.array(z.string().nullable()),
  setName:           z.string().nullable(),
  source:            z.string().nullable(),
  link:              z.array(z.object({ url: z.string(), label: z.string().optional() })).nullable(),
});

const list = os
  .route({
    method:      'GET',
    description: 'List announcements with item counts and affected formats',
    tags:        ['Hearthstone', 'Announcement'],
  })
  .input(z.any())
  .output(z.array(z.object({
    id:        z.uuid(),
    source:    z.string(),
    date:      z.string(),
    name:      z.string(),
    itemCount: z.number(),
    formats:   z.array(z.string()),
  })))
  .handler(async () => {
    const rows = await db
      .select({
        id:          Announcement.id,
        source:      Announcement.source,
        date:        Announcement.date,
        name:        Announcement.name,
        itemCount:   sql<number>`coalesce(count(${AnnouncementItem.id}), 0)`,
        formatsJson: sql<string>`coalesce(jsonb_agg(${AnnouncementItem.projection}->'formats')::text, '[]')`,
      })
      .from(Announcement)
      .leftJoin(AnnouncementItem, eq(AnnouncementItem.announcementId, Announcement.id))
      .groupBy(Announcement.id, Announcement.source, Announcement.date, Announcement.name)
      .orderBy(desc(Announcement.date))
      .catch(error => {
        if (isMissingTable(error)) return [];
        throw error;
      });

    return rows.map(row => ({
      id:        row.id,
      source:    row.source,
      date:      row.date,
      name:      row.name,
      itemCount: Number(row.itemCount),
      formats:   [...new Set(
        (JSON.parse(row.formatsJson) as unknown[])
          .flatMap(arr => (Array.isArray(arr) ? arr : []).filter((f): f is string => typeof f === 'string')),
      )],
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

    const names = await resolveItemNames(items, input.lang);

    return {
      ...row,
      link:  row.link as { url: string, label?: string }[],
      items: items.map(item => ({
        ...item,
        glow:              item.glow as GlowEntry[] | null,
        delta:             item.delta as Record<string, unknown> | null,
        images:            images.get(item.id) ?? [],
        cardName:          names.get(item.id)?.cardName ?? null,
        relatedCardNames:  names.get(item.id)?.relatedCardNames ?? [],
        relatedCardHashes: names.get(item.id)?.relatedCardHashes ?? [],
        setName:           names.get(item.id)?.setName ?? null,
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
      .orderBy(desc(Announcement.date), asc(AnnouncementItem.order));

    const annMap = await announcementContexts(rows);
    const images = await resolveAnnouncementItemImages(
      rows.map(({ item }) => imageItem(item, annMap)),
      input.lang,
    );

    const names = await resolveItemNames(
      rows.map(({ item }) => ({ id: item.id, cardId: item.cardId, relatedCards: item.relatedCards, setId: item.setId })),
      input.lang,
    );

    return rows.map(({ item }) => ({
      ...item,
      date:              annMap.get(item.announcementId)?.date ?? null,
      name:              annMap.get(item.announcementId)?.name ?? null,
      source:            annMap.get(item.announcementId)?.source ?? null,
      link:              annMap.get(item.announcementId)?.link ?? null,
      createdAt:         item.createdAt.toISOString(),
      updatedAt:         item.updatedAt.toISOString(),
      glow:              item.glow as GlowEntry[] | null,
      delta:             item.delta as Record<string, unknown> | null,
      images:            images.get(item.id) ?? [],
      cardName:          names.get(item.id)?.cardName ?? null,
      relatedCardNames:  names.get(item.id)?.relatedCardNames ?? [],
      relatedCardHashes: names.get(item.id)?.relatedCardHashes ?? [],
      setName:           names.get(item.id)?.setName ?? null,
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
      .orderBy(desc(Announcement.date), asc(AnnouncementItem.order));

    const annMap = await announcementContexts(rows);
    const images = await resolveAnnouncementItemImages(
      rows.map(({ item }) => imageItem(item, annMap)),
      input.lang,
    );

    const names = await resolveItemNames(
      rows.map(({ item }) => ({ id: item.id, cardId: item.cardId, relatedCards: item.relatedCards, setId: item.setId })),
      input.lang,
    );

    return rows.map(({ item }) => ({
      ...item,
      date:              annMap.get(item.announcementId)?.date ?? null,
      name:              annMap.get(item.announcementId)?.name ?? null,
      source:            annMap.get(item.announcementId)?.source ?? null,
      link:              annMap.get(item.announcementId)?.link ?? null,
      createdAt:         item.createdAt.toISOString(),
      updatedAt:         item.updatedAt.toISOString(),
      glow:              item.glow as GlowEntry[] | null,
      delta:             item.delta as Record<string, unknown> | null,
      images:            images.get(item.id) ?? [],
      cardName:          names.get(item.id)?.cardName ?? null,
      relatedCardNames:  names.get(item.id)?.relatedCardNames ?? [],
      relatedCardHashes: names.get(item.id)?.relatedCardHashes ?? [],
      setName:           names.get(item.id)?.setName ?? null,
    }));
  });

type AnnouncementContext = {
  date:   string | null;
  name:   string | null;
  source: string | null;
  link:   { url: string, label?: string }[] | null;
  version: number;
  lastVersion: number | null;
};

/** Batch-loads announcement date/version/source/link context for each item's announcement. */
async function announcementContexts(
  rows: Array<{ item: typeof AnnouncementItem.$inferSelect }>,
): Promise<Map<string, AnnouncementContext>> {
  const ids = [...new Set(rows.map(row => row.item.announcementId))];
  const annRows = await db
    .select({
      id:         Announcement.id,
      date:       Announcement.date,
      name:       Announcement.name,
      source:     Announcement.source,
      link:       Announcement.link,
      version:    Announcement.version,
      lastVersion: Announcement.lastVersion,
    })
    .from(Announcement)
    .where(inArray(Announcement.id, ids));
  return new Map(annRows.map(ann => [ann.id, {
    date:        ann.date,
    name:        ann.name,
    source:      ann.source,
    link:        ann.link as { url: string, label?: string }[] | null,
    version:     ann.version,
    lastVersion: ann.lastVersion,
  }]));
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

interface ItemNames {
  cardName:          string | null;
  relatedCardNames:  string[];
  relatedCardHashes: (string | null)[];
  setName:           string | null;
}

/** Batch-resolves display names and main-image hashes for a set of announcement items. */
async function resolveItemNames(
  items: Array<{ id: string, cardId: string | null, relatedCards: string[], setId: string | null }>,
  lang: Locale,
): Promise<Map<string, ItemNames>> {
  const cardIds = [...new Set(items.flatMap(it => [it.cardId, ...it.relatedCards].filter((v): v is string => !!v)))];
  const setIds = [...new Set(items.map(it => it.setId).filter((v): v is string => !!v))];

  const [cardRows, setRows] = await Promise.all([
    cardIds.length > 0
      ? db.select({
        cardId:     EntityLocalization.cardId,
        name:       EntityLocalization.name,
        renderHash: EntityLocalization.renderHash,
        version:    EntityLocalization.version,
      })
        .from(EntityLocalization)
        .where(and(inArray(EntityLocalization.cardId, cardIds), eq(EntityLocalization.lang, lang)))
        .orderBy(desc(EntityLocalization.version))
      : Promise.resolve([] as Array<{ cardId: string, name: string, renderHash: string, version: number[] }>),
    setIds.length > 0
      ? db.select({ setId: SetLocalization.setId, name: SetLocalization.name })
        .from(SetLocalization)
        .where(and(inArray(SetLocalization.setId, setIds), eq(SetLocalization.lang, lang)))
      : Promise.resolve([] as Array<{ setId: string, name: string }>),
  ]);

  const cardName = new Map<string, string>();
  const cardHash = new Map<string, string | null>();
  for (const r of cardRows) {
    if (!cardName.has(r.cardId)) {
      cardName.set(r.cardId, r.name);
      cardHash.set(r.cardId, r.renderHash);
    }
  }
  const setName = new Map<string, string>();
  for (const r of setRows) if (!setName.has(r.setId)) setName.set(r.setId, r.name);

  return new Map(items.map(item => [
    item.id,
    {
      cardName:          item.cardId ? cardName.get(item.cardId) ?? null : null,
      relatedCardNames:  item.relatedCards.map(id => cardName.get(id) ?? id),
      relatedCardHashes: item.relatedCards.map(id => cardHash.get(id) ?? null),
      setName:           item.setId ? setName.get(item.setId) ?? null : null,
    },
  ]));
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
