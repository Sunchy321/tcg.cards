import { ORPCError } from '@orpc/server';
import { asc, eq, inArray } from 'drizzle-orm';

import { db } from '#db/db';
import {
  setGetInput,
  setListInput,
  setListResult,
  setProfile,
  setUpdateInput,
  type SetLocalization,
  type SetListInput,
  type SetProfile,
  type SetUpdateInput,
} from '#model/hearthstone/schema/set';
import { Set as HearthstoneSet, SetLocalization as HearthstoneSetLocalization } from '#schema/hearthstone';
import { os } from '#server/orpc';

type SetRow = typeof HearthstoneSet.$inferSelect;
type SetLocalizationRow = typeof HearthstoneSetLocalization.$inferSelect;

function normalizeText(value: string | null) {
  const text = value?.trim();
  return text && text.length > 0 ? text : null;
}

function normalizeRequiredText(value: string) {
  return value.trim();
}

function normalizeLocalization(localization: SetLocalization[]) {
  const items = localization
    .map(item => ({
      lang: item.lang.trim(),
      name: item.name.trim(),
    }))
    .filter(item => item.lang.length > 0 && item.name.length > 0);

  const langSet = new Set<string>();
  for (const item of items) {
    if (langSet.has(item.lang)) {
      throw new ORPCError('BAD_REQUEST', {
        message: `Duplicate localization language: ${item.lang}`,
      });
    }

    langSet.add(item.lang);
  }

  return items.sort((left, right) => left.lang.localeCompare(right.lang));
}

function buildLocalizationMap(rows: SetLocalizationRow[]) {
  const map = new Map<string, SetLocalization[]>();

  for (const row of rows) {
    const items = map.get(row.setId) ?? [];
    items.push({
      lang: row.lang,
      name: row.name,
    });
    map.set(row.setId, items);
  }

  return map;
}

function toProfile(
  row: SetRow,
  localization: SetLocalization[] = [],
): SetProfile {
  return {
    setId:         row.setId,
    dbfId:         row.dbfId,
    slug:          row.slug,
    rawName:       row.rawName,
    localization,
    type:          row.type,
    releaseDate:   row.releaseDate,
    cardCountFull: row.cardCountFull,
    cardCount:     row.cardCount,
    group:         row.group,
  };
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

  const values = [
    profile.setId,
    profile.dbfId == null ? null : String(profile.dbfId),
    profile.slug,
    profile.rawName,
    profile.type,
    profile.releaseDate,
    profile.group,
    ...profile.localization.flatMap(item => [item.lang, item.name]),
  ];

  return values.some(value => value?.toLowerCase().includes(q));
}

async function loadLocalizations(setIds: string[]) {
  if (setIds.length === 0) {
    return new Map<string, SetLocalization[]>();
  }

  const rows = await db.select()
    .from(HearthstoneSetLocalization)
    .where(inArray(HearthstoneSetLocalization.setId, setIds))
    .orderBy(
      asc(HearthstoneSetLocalization.setId),
      asc(HearthstoneSetLocalization.lang),
    );

  return buildLocalizationMap(rows);
}

const list = os
  .route({
    method:      'GET',
    description: 'List Hearthstone set configurations',
    tags:        ['Console', 'Hearthstone', 'Set'],
  })
  .input(setListInput)
  .output(setListResult)
  .handler(async ({ input }) => {
    const rows = await db.select()
      .from(HearthstoneSet)
      .orderBy(
        asc(HearthstoneSet.dbfId),
        asc(HearthstoneSet.setId),
      );

    const localizationBySetId = await loadLocalizations(rows.map(row => row.setId));
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
    description: 'Get one Hearthstone set configuration',
    tags:        ['Console', 'Hearthstone', 'Set'],
  })
  .input(setGetInput)
  .output(setProfile)
  .handler(async ({ input }) => {
    const row = await db.select()
      .from(HearthstoneSet)
      .where(eq(HearthstoneSet.setId, input.setId))
      .then(items => items[0]);

    if (!row) {
      throw new ORPCError('NOT_FOUND', { message: 'Set not found' });
    }

    const localizationBySetId = await loadLocalizations([row.setId]);

    return toProfile(row, localizationBySetId.get(row.setId) ?? []);
  });

const update = os
  .route({
    method:      'PUT',
    description: 'Update one Hearthstone set configuration',
    tags:        ['Console', 'Hearthstone', 'Set'],
  })
  .input(setUpdateInput)
  .output(setProfile)
  .handler(async ({ input }) => {
    const localization = normalizeLocalization(input.localization);

    return await db.transaction(async tx => {
      const existing = await tx.select({
        setId: HearthstoneSet.setId,
      })
        .from(HearthstoneSet)
        .where(eq(HearthstoneSet.setId, input.setId))
        .then(items => items[0]);

      if (!existing) {
        throw new ORPCError('NOT_FOUND', { message: 'Set not found' });
      }

      const row = await tx.update(HearthstoneSet)
        .set({
          dbfId:         input.dbfId,
          slug:          normalizeText(input.slug),
          rawName:       normalizeText(input.rawName),
          type:          normalizeRequiredText(input.type),
          releaseDate:   input.releaseDate,
          cardCountFull: input.cardCountFull,
          cardCount:     input.cardCount,
          group:         normalizeText(input.group),
        })
        .where(eq(HearthstoneSet.setId, input.setId))
        .returning()
        .then(items => items[0]);

      if (!row) {
        throw new ORPCError('NOT_FOUND', { message: 'Set not found' });
      }

      await tx.delete(HearthstoneSetLocalization)
        .where(eq(HearthstoneSetLocalization.setId, input.setId));

      if (localization.length > 0) {
        await tx.insert(HearthstoneSetLocalization)
          .values(localization.map(item => ({
            setId: input.setId,
            lang:  item.lang,
            name:  item.name,
          })));
      }

      return toProfile(row, localization);
    });
  });

export const setTrpc = {
  list,
  get,
  update,
};
