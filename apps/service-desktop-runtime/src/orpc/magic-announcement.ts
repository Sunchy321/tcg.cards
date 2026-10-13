import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { and, asc, desc, eq, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import { changeStatus, gameChangeType, type Legality } from '@tcg-cards/model/magic/schema/announcement';
import { Announcement, AnnouncementItem, Card, CardLocalization, CardPart, Format, Print } from '@tcg-cards/db/schema/local/magic';
import { Set as SetTable } from '@tcg-cards/db/schema/shared/magic/set';

import { os } from './index';
import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';
import { groupCardLists } from '../lib/magic/announcement/data/card-groups';
import { runApply, type ApplyCardMeta } from '../lib/magic/announcement/apply';
import {
  isSentinelCardId,
  projectItem,
  type ProjectionContext,
} from '../lib/magic/announcement/projection';

const itemInput = z.object({
  type:          gameChangeType,
  effectiveDate: z.string().nullish(),
  format:        z.string().nullish(),
  status:        changeStatus.nullish(),
  score:         z.number().int().nullish(),
  group:         z.string().nullish(),
  prevVersion:   z.string().nullish(),
  delta:         z.any().nullish(),
  glow:          z.any().nullish(),
  cardId:        z.string().nullish(),
  setId:         z.string().nullish(),
  ruleId:        z.string().nullish(),
  relatedCards:  z.string().array().default([]),
});

type ItemInput = z.infer<typeof itemInput>;

function toItemRow(item: ItemInput, announcementId: string, order: number) {
  return {
    announcementId,
    order,
    type:          item.type,
    effectiveDate: item.effectiveDate ?? null,
    format:        item.format ?? null,
    status:        item.status ?? null,
    score:         item.score ?? null,
    group:         item.group ?? null,
    prevVersion:   item.prevVersion ?? null,
    delta:         item.delta ?? null,
    glow:          item.glow ?? null,
    cardId:        item.cardId ?? null,
    setId:         item.setId ?? null,
    ruleId:        item.ruleId ?? null,
    relatedCards:  item.relatedCards,
  };
}

const announcementInput = z.object({
  source:                z.string(),
  date:                  z.string(),
  name:                  z.string(),
  effectiveDate:         z.string().nullish(),
  effectiveDateTabletop: z.string().nullish(),
  effectiveDateOnline:   z.string().nullish(),
  effectiveDateArena:    z.string().nullish(),
  nextDate:              z.string().nullish(),
  prevVersion:           z.string().nullish(),
  link:                  z.array(z.object({ url: z.string(), label: z.string().optional() })).default([]),
  items:                 itemInput.array().default([]),
});

const list = os
  .input(z.any())
  .output(z.any())
  .handler(async () => {
    const db = getLocalDb();
    const announcements = await db.select({
      id:     Announcement.id,
      source: Announcement.source,
      date:   Announcement.date,
      name:   Announcement.name,
    })
      .from(Announcement)
      .orderBy(desc(Announcement.date));

    const counts = announcements.length > 0
      ? await db.select({
        announcementId: AnnouncementItem.announcementId,
        count:          sql<number>`count(*)::int`,
      })
        .from(AnnouncementItem)
        .where(inArray(AnnouncementItem.announcementId, announcements.map(a => a.id)))
        .groupBy(AnnouncementItem.announcementId)
      : [];

    const countByAnnouncement = new Map(counts.map(c => [c.announcementId, c.count]));
    return announcements.map(a => ({ ...a, itemCount: countByAnnouncement.get(a.id) ?? 0 }));
  });

const get = os
  .input(z.object({ id: z.uuid() }))
  .output(z.any())
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const row = await db.select()
      .from(Announcement)
      .where(eq(Announcement.id, input.id))
      .then(rows => rows[0]);

    if (!row) {
      throw new ORPCError('NOT_FOUND');
    }

    const items = await db.select()
      .from(AnnouncementItem)
      .where(eq(AnnouncementItem.announcementId, input.id))
      .orderBy(asc(AnnouncementItem.order));

    return {
      ...row,
      link:      row.link,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      items:     items.map(item => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    };
  });

const create = os
  .input(announcementInput)
  .output(z.any())
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const result = await db.insert(Announcement).values({
      source:                input.source,
      date:                  input.date,
      name:                  input.name,
      effectiveDate:         input.effectiveDate ?? null,
      effectiveDateTabletop: input.effectiveDateTabletop ?? null,
      effectiveDateOnline:   input.effectiveDateOnline ?? null,
      effectiveDateArena:    input.effectiveDateArena ?? null,
      nextDate:              input.nextDate ?? null,
      prevVersion:           input.prevVersion ?? null,
      link:                  input.link,
    }).returning();

    const row = result[0]!;

    if (input.items.length > 0) {
      await db.insert(AnnouncementItem).values(input.items.map((item, i) => toItemRow(item, row.id, i)));
    }

    return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  });

const update = os
  .input(announcementInput.extend({ id: z.uuid() }))
  .output(z.void())
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const { id, ...data } = input;

    await db.update(Announcement).set({
      source:                data.source,
      date:                  data.date,
      name:                  data.name,
      effectiveDate:         data.effectiveDate ?? null,
      effectiveDateTabletop: data.effectiveDateTabletop ?? null,
      effectiveDateOnline:   data.effectiveDateOnline ?? null,
      effectiveDateArena:    data.effectiveDateArena ?? null,
      nextDate:              data.nextDate ?? null,
      prevVersion:           data.prevVersion ?? null,
      link:                  data.link,
    }).where(eq(Announcement.id, id));

    // Full replace: the form edits the complete item list and rows carry no user-facing identity.
    await db.delete(AnnouncementItem).where(eq(AnnouncementItem.announcementId, id));
    if (data.items.length > 0) {
      await db.insert(AnnouncementItem).values(data.items.map((item, i) => toItemRow(item, id, i)));
    }
  });

const remove = os
  .input(z.object({ id: z.uuid() }))
  .output(z.void())
  .handler(async ({ input }) => {
    const db = getLocalDb();
    await db.delete(AnnouncementItem).where(eq(AnnouncementItem.announcementId, input.id));
    await db.delete(Announcement).where(eq(Announcement.id, input.id));
  });

/** Sentinel group card lists resolved from the database; the fixed lists come from groupCardLists. */
async function resolveGroupCards(db: NonNullable<ReturnType<typeof getLocalDb>>, groupNames: string[]): Promise<Record<string, string[]>> {
  const resolved: Record<string, string[]> = {};
  const computedNames = groupNames.filter(name => groupCardLists[name] == null);

  if (computedNames.length > 0) {
    const conspiracy = await db.select({ cardId: Card.cardId })
      .from(Card)
      .innerJoin(CardPart, and(eq(CardPart.cardId, Card.cardId), eq(CardPart.version, Card.version)))
      .where(sql`'conspiracy' = any(${CardPart.typeMain})`)
      .groupBy(Card.cardId);

    const legendary = await db.select({ cardId: Print.cardId })
      .from(Print)
      .innerJoin(CardPart, and(eq(CardPart.cardId, Print.cardId), eq(CardPart.version, Print.version)))
      .where(and(
        sql`'legendary' = any(${CardPart.typeSuper})`,
        lte(Print.releaseDate, '1995-11-01'),
      ))
      .groupBy(Print.cardId);

    resolved.conspiracy = conspiracy.map(r => r.cardId);
    resolved.legendary = legendary.map(r => r.cardId);
  }

  return Object.fromEntries(groupNames.map(name => [name, groupCardLists[name] ?? resolved[name] ?? []]));
}

const project = os
  .input(z.object({ announcementId: z.uuid() }))
  .output(z.void())
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const announcement = await db.select()
      .from(Announcement)
      .where(eq(Announcement.id, input.announcementId))
      .then(rows => rows[0]);

    if (!announcement) {
      throw new ORPCError('NOT_FOUND');
    }

    const items = await db.select()
      .from(AnnouncementItem)
      .where(eq(AnnouncementItem.announcementId, input.announcementId));

    const setIds = [...new Set(items.filter(i => i.type === 'set_change' && i.setId != null).map(i => i.setId!))];
    const setCards: Record<string, string[]> = {};
    if (setIds.length > 0) {
      const rows = await db.select({ setId: Print.set, cardId: Print.cardId })
        .from(Print)
        .where(inArray(Print.set, setIds))
        .groupBy(Print.set, Print.cardId);
      for (const row of rows) {
        (setCards[row.setId] ??= []).push(row.cardId);
      }
    }

    const groupNames = [...new Set(items
      .filter(i => i.cardId != null && isSentinelCardId(i.cardId))
      .map(i => i.cardId!.slice(1)))];
    const groupCards = await resolveGroupCards(db, groupNames);

    const sentinelCardIds = [...new Set(Object.values(groupCards).flat())];
    const cardReleaseDates: Record<string, string> = {};
    if (sentinelCardIds.length > 0) {
      const rows = await db.select({ cardId: Print.cardId, releaseDate: sql<string>`min(${Print.releaseDate})` })
        .from(Print)
        .where(inArray(Print.cardId, sentinelCardIds))
        .groupBy(Print.cardId);
      for (const row of rows) {
        cardReleaseDates[row.cardId] = row.releaseDate;
      }
    }

    const context: ProjectionContext = {
      setCards,
      groupCards,
      cardReleaseDates,
      announcementEffectiveDate: announcement.effectiveDate ?? announcement.date,
    };

    for (const item of items) {
      const projection = projectItem(item, context);
      await db.update(AnnouncementItem).set({ projection }).where(eq(AnnouncementItem.id, item.id));
    }
  });

const apply = os
  .input(z.object({ dryRun: z.boolean().optional() }))
  .output(z.object({ warnings: z.string().array(), formatCount: z.number().int(), dryRun: z.boolean() }))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const [formats, sets, announcements] = await Promise.all([
      db.select().from(Format),
      db.select({ setId: SetTable.setId, type: SetTable.type, releaseDate: SetTable.releaseDate }).from(SetTable),
      db.select().from(Announcement).orderBy(asc(Announcement.date)),
    ]);
    const items = announcements.length > 0
      ? await db.select().from(AnnouncementItem)
      : [];

    const groupNames = [...new Set(items
      .filter(i => i.cardId != null && isSentinelCardId(i.cardId))
      .map(i => i.cardId!.slice(1)))];
    const groupCards = await resolveGroupCards(db, groupNames);
    const sentinelCardIds = [...new Set(Object.values(groupCards).flat())];

    const cardMeta: Record<string, ApplyCardMeta> = {};
    for (const cardId of sentinelCardIds) {
      cardMeta[cardId] = { typeMain: [], rarities: [], sets: [], releaseDate: null };
    }
    if (sentinelCardIds.length > 0) {
      const typeRows = await db.select({ cardId: Card.cardId, typeMain: CardPart.typeMain })
        .from(Card)
        .innerJoin(CardPart, and(eq(CardPart.cardId, Card.cardId), eq(CardPart.version, Card.version)))
        .where(inArray(Card.cardId, sentinelCardIds));
      const printRows = await db.select({
        cardId:      Print.cardId,
        set:         Print.set,
        rarity:      Print.rarity,
        releaseDate: Print.releaseDate,
      })
        .from(Print)
        .where(inArray(Print.cardId, sentinelCardIds));

      for (const row of typeRows) {
        const meta = cardMeta[row.cardId];
        if (meta == null) {
          continue;
        }
        for (const type of row.typeMain) {
          if (!meta.typeMain.includes(type)) {
            meta.typeMain.push(type);
          }
        }
      }
      for (const row of printRows) {
        const meta = cardMeta[row.cardId];
        if (meta == null) {
          continue;
        }
        if (!meta.rarities.includes(row.rarity)) {
          meta.rarities.push(row.rarity);
        }
        if (!meta.sets.includes(row.set)) {
          meta.sets.push(row.set);
        }
        if (meta.releaseDate == null || row.releaseDate < meta.releaseDate) {
          meta.releaseDate = row.releaseDate;
        }
      }
    }

    const result = runApply({
      formats:       formats.map(f => ({ formatId: f.formatId, birthday: f.birthday, deathdate: f.deathdate })),
      sets,
      announcements: announcements.map(a => ({
        date:          a.date,
        effectiveDate: a.effectiveDate,
        items:         items
          .filter(i => i.announcementId === a.id)
          .map(i => ({
            type:          i.type,
            effectiveDate: i.effectiveDate,
            format:        i.format,
            status:        i.status,
            score:         i.score,
            group:         i.group,
            cardId:        i.cardId,
            setId:         i.setId,
            relatedCards:  i.relatedCards,
          })),
      })),
      cardMeta,
      groupCards,
      today: new Date().toISOString().split('T')[0]!,
    });

    if (!input.dryRun) {
      for (const f of result.formats) {
        await db.update(Format).set({
          sets:    f.sets,
          // Banlist statuses arrive as validated text and narrow to the model's legality enum here.
          banlist: f.banlist.map(e => ({ ...e, status: e.status as Legality })),
        }).where(eq(Format.formatId, f.formatId));
      }
    }

    return { warnings: result.warnings, formatCount: result.formats.length, dryRun: input.dryRun ?? false };
  });

const cardSearchResult = z.object({
  cardId: z.string(),
  nameEn: z.string().nullable(),
  nameZh: z.string().nullable(),
  set:    z.string().nullable(),
  type:   z.string().nullable(),
});

const resolvedCardName = z.object({
  cardId: z.string(),
  nameEn: z.string().nullable(),
  nameZh: z.string().nullable(),
});

/** Joins the zhs localization (official standard row first) onto the latest non-deleted card version. */
function latestCardWithZhsName(db: ReturnType<typeof getLocalDb>) {
  return db
    .selectDistinctOn([Card.cardId], {
      cardId: Card.cardId,
      nameEn: Card.name,
      nameZh: CardLocalization.name,
    })
    .from(Card)
    .leftJoin(CardLocalization, and(
      eq(CardLocalization.cardId, Card.cardId),
      eq(CardLocalization.version, Card.version),
      eq(CardLocalization.locale, 'zhs'),
      isNull(CardLocalization.deletedAt),
    ));
}

const searchCards = os
  .input(z.object({
    q:      z.string().trim().min(1).max(100),
    limit:  z.number().int().min(1).max(50).default(20),
    format: z.string().trim().optional(),
  }))
  .output(z.array(cardSearchResult))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const term = `%${input.q}%`;
    // `format` is accepted for the shared editor contract and currently ignored:
    // magic format filtering by set pool is a future refinement.
    const rows = await latestCardWithZhsName(db)
      .where(and(
        isNull(Card.deletedAt),
        or(ilike(Card.name, term), ilike(Card.cardId, term), ilike(CardLocalization.name, term)),
      ))
      .orderBy(Card.cardId, desc(Card.version), CardLocalization.source)
      .limit(input.limit);

    return rows.map(row => ({ cardId: row.cardId, nameEn: row.nameEn, nameZh: row.nameZh, set: null, type: null }));
  });

const resolveCardNames = os
  .input(z.object({ cardIds: z.array(z.string()).min(1).max(50) }))
  .output(z.array(resolvedCardName))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    return latestCardWithZhsName(db)
      .where(and(isNull(Card.deletedAt), inArray(Card.cardId, input.cardIds)))
      .orderBy(Card.cardId, desc(Card.version), CardLocalization.source);
  });

export const magicAnnouncementRouter = {
  list,
  get,
  create,
  update,
  remove,
  project,
  apply,
  searchCards,
  resolveCardNames,
};
