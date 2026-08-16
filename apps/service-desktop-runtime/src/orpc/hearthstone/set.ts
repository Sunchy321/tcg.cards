// This file is a copy of packages/console-api/src/orpc/hearthstone/set.ts
// adapted to use getLocalDb() instead of @tcg-cards/db/db.
//
// 1. Keep this file in sync with the original.
// 2. When refactoring, prefer extracting shared db-agnostic helpers so this
//    file can be removed and replaced by a thin local-db adapter.

import { ORPCError, os } from '@orpc/server';
import { asc, eq, inArray } from 'drizzle-orm';

import {
  Entity,
  Set as HearthstoneSet,
  SetLocalization as HearthstoneSetLocalization,
} from '@tcg-cards/db/schema/local/hearthstone';
import {
  setGetInput,
  setListInput,
  setListResult,
  setProfile,
  setUpdateInput,
  type SetListInput,
  type SetProfile,
} from '@tcg-cards/model/src/hearthstone/schema/set';

import { getLocalDb } from '../../lib/hearthstone/hsdata-local-db';

type LocalDb = ReturnType<typeof getLocalDb>;

function normalizeText(value: string | null) {
  const text = value?.trim();
  return text && text.length > 0 ? text : null;
}

function normalizeRequiredText(value: string) {
  return value.trim();
}

function matchesSearch(profile: SetProfile, input: SetListInput) {
  const type = input.type?.trim().toLowerCase();
  if (type && profile.type.toLowerCase() !== type) {
    return false;
  }

  const group = input.group?.trim().toLowerCase();
  if (group && (profile.group?.toLowerCase() ?? '') !== group) {
    return false;
  }

  const q = input.q?.trim().toLowerCase();
  if (!q) {
    return true;
  }

  return [
    profile.setId,
    profile.dbfId == null ? null : String(profile.dbfId),
    profile.slug,
    profile.rawName,
    profile.type,
    profile.releaseDate,
    profile.group,
    ...profile.localization.flatMap(item => [item.lang, item.name]),
  ].some(value => value?.toLowerCase().includes(q));
}

async function loadLocalizations(db: LocalDb, setIds: string[]) {
  if (setIds.length === 0) {
    return new Map<string, Array<{ lang: string; name: string }>>();
  }

  const rows = await db.select()
    .from(HearthstoneSetLocalization)
    .where(inArray(HearthstoneSetLocalization.setId, setIds))
    .orderBy(
      asc(HearthstoneSetLocalization.setId),
      asc(HearthstoneSetLocalization.lang),
    );

  const map = new Map<string, Array<{ lang: string; name: string }>>();
  for (const row of rows) {
    const items = map.get(row.setId) ?? [];
    items.push({ lang: row.lang, name: row.name });
    map.set(row.setId, items);
  }
  return map;
}

function toProfile(row: typeof HearthstoneSet.$inferSelect, locs: Array<{ lang: string; name: string }> = []): SetProfile {
  return {
    setId:         row.setId,
    dbfId:         row.dbfId,
    slug:          row.slug,
    rawName:       row.rawName,
    localization:  locs,
    type:          row.type,
    releaseDate:   row.releaseDate,
    cardCountFull: row.cardCountFull,
    cardCount:     row.cardCount,
    group:         row.group,
  };
}

const list = os
  .route({
    method:      'GET',
    description: 'List local Hearthstone set configurations',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Set'],
  })
  .input(setListInput)
  .output(setListResult)
  .handler(async ({ input }) => {
    const db = getLocalDb();

    const rows = await db.select()
      .from(HearthstoneSet)
      .orderBy(
        asc(HearthstoneSet.dbfId),
        asc(HearthstoneSet.setId),
      );

    const localizationBySetId = await loadLocalizations(db, rows.map(row => row.setId));
    const profiles = rows
      .map(row => toProfile(row, localizationBySetId.get(row.setId) ?? []))
      .filter(profile => matchesSearch(profile, input));

    const offset = (input.page - 1) * input.limit;

    return {
      items: profiles.slice(offset, offset + input.limit),
      total: profiles.length,
      page:  input.page,
      limit: input.limit,
    };
  });

const get = os
  .route({
    method:      'GET',
    description: 'Get one local Hearthstone set configuration',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Set'],
  })
  .input(setGetInput)
  .output(setProfile)
  .handler(async ({ input }) => {
    const db = getLocalDb();

    const row = await db.select()
      .from(HearthstoneSet)
      .where(eq(HearthstoneSet.setId, input.setId))
      .then(items => items[0]);

    if (!row) {
      throw new ORPCError('NOT_FOUND', { message: 'Set not found' });
    }

    const localizationBySetId = await loadLocalizations(db, [row.setId]);

    return toProfile(row, localizationBySetId.get(row.setId) ?? []);
  });

const update = os
  .route({
    method:      'PUT',
    description: 'Update one local Hearthstone set configuration',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Set'],
  })
  .input(setUpdateInput)
  .output(setProfile)
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const originalSetId = input.originalSetId.trim();
    const nextSetId = input.setId.trim();

    return await db.transaction(async tx => {
      const existing = await tx.select()
        .from(HearthstoneSet)
        .where(eq(HearthstoneSet.setId, originalSetId))
        .then(items => items[0]);

      if (!existing) {
        throw new ORPCError('NOT_FOUND', { message: 'Set not found' });
      }

      if (originalSetId !== nextSetId) {
        const conflict = await tx.select({ setId: HearthstoneSet.setId })
          .from(HearthstoneSet)
          .where(eq(HearthstoneSet.setId, nextSetId))
          .then(items => items[0]);

        if (conflict) {
          throw new ORPCError('CONFLICT', { message: `Set ${nextSetId} already exists` });
        }
      }

      await tx.update(HearthstoneSet)
        .set({
          setId:         nextSetId,
          dbfId:         input.dbfId,
          slug:          normalizeText(input.slug),
          rawName:       normalizeText(input.rawName),
          type:          normalizeRequiredText(input.type),
          releaseDate:   input.releaseDate,
          cardCountFull: input.cardCountFull,
          cardCount:     input.cardCount,
          group:         normalizeText(input.group),
        })
        .where(eq(HearthstoneSet.setId, originalSetId));

      if (originalSetId !== nextSetId) {
        await tx.update(Entity)
          .set({ set: nextSetId })
          .where(eq(Entity.set, originalSetId));
      }

      await tx.delete(HearthstoneSetLocalization)
        .where(eq(HearthstoneSetLocalization.setId, originalSetId));

      const localization = input.localization
        .map(item => ({ lang: item.lang.trim(), name: item.name.trim() }))
        .filter(item => item.lang.length > 0 && item.name.length > 0);

      if (localization.length > 0) {
        await tx.insert(HearthstoneSetLocalization)
          .values(localization.map(item => ({
            setId: nextSetId,
            lang:  item.lang,
            name:  item.name,
          })));
      }

      const row = await tx.select()
        .from(HearthstoneSet)
        .where(eq(HearthstoneSet.setId, nextSetId))
        .then(items => items[0]);

      if (!row) {
        throw new ORPCError('NOT_FOUND', { message: 'Set not found' });
      }

      return toProfile(row, localization);
    });
  });

export const setRouter = {
  list,
  get,
  update,
};
