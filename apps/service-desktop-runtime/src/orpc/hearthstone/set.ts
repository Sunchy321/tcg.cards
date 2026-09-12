// This file is a copy of packages/console-api/src/orpc/hearthstone/set.ts
// adapted to use getLocalDb() instead of @tcg-cards/db/db.
//
// 1. Keep this file in sync with the original.
// 2. When refactoring, prefer extracting shared db-agnostic helpers so this
//    file can be removed and replaced by a thin local-db adapter.

import { ORPCError, os } from '@orpc/server';
import { asc, eq } from 'drizzle-orm';

import {
  BaseEntity,
  Set as HearthstoneSet,
} from '@tcg-cards/db/schema/local/hearthstone';
import {
  setGetInput,
  setListInput,
  setListResult,
  setProfile,
  setUpdateInput,
  type SetListInput,
  type SetProfile,
  type SetUpdateInput,
} from '@tcg-cards/model/hearthstone/schema/set';

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
    profile.rawName,
    profile.type,
    profile.releaseDate,
    profile.group,
    ...Object.entries(profile.localization).flatMap(([lang, names]) => [
      lang,
      names.full,
      names.short,
      names.initials,
      names.mini,
    ]),
  ].some(value => value?.toLowerCase().includes(q));
}

function toProfile(row: typeof HearthstoneSet.$inferSelect): SetProfile {
  return {
    setId:         row.setId,
    dbfId:         row.dbfId,
    rawName:       row.rawName,
    localization:  row.localization,
    type:          row.type,
    releaseDate:   row.releaseDate,
    cardCountFull: row.cardCountFull,
    cardCount:     row.cardCount,
    group:         row.group,
    year:          row.year,
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

    const profiles = rows
      .map(toProfile)
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

    return toProfile(row);
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
          rawName:       normalizeText(input.rawName),
          localization:  input.localization,
          type:          normalizeRequiredText(input.type),
          releaseDate:   input.releaseDate,
          cardCountFull: input.cardCountFull,
          cardCount:     input.cardCount,
          group:         normalizeText(input.group),
        })
        .where(eq(HearthstoneSet.setId, originalSetId));

      if (originalSetId !== nextSetId) {
        await tx.update(BaseEntity)
          .set({ set: nextSetId })
          .where(eq(BaseEntity.set, originalSetId));
      }

      const row = await tx.select()
        .from(HearthstoneSet)
        .where(eq(HearthstoneSet.setId, nextSetId))
        .then(items => items[0]);

      if (!row) {
        throw new ORPCError('NOT_FOUND', { message: 'Set not found' });
      }

      return toProfile(row);
    });
  });

export const setRouter = {
  list,
  get,
  update,
};
