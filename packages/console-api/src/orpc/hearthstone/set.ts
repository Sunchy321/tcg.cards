import { ORPCError, os } from '@orpc/server';
import { asc, eq, inArray } from 'drizzle-orm';

import { db } from '@tcg-cards/db/db';
import {
  AnnouncementItem,
  BaseEntity,
  Set as HearthstoneSet,
  SetLocalization as HearthstoneSetLocalization,
} from '@tcg-cards/db/schema/shared/hearthstone';
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
} from '@tcg-cards/model/src/hearthstone/schema/set';

/** Transaction type used by the set management helpers. */
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Database row shape for one Hearthstone set. */
type SetRow = typeof HearthstoneSet.$inferSelect;
/** Database row shape for one Hearthstone set localization. */
type SetLocalizationRow = typeof HearthstoneSetLocalization.$inferSelect;

/** Nullable text fields normalized for storage. */
function normalizeText(value: string | null) {
  const text = value?.trim();
  return text && text.length > 0 ? text : null;
}

/** Required text fields normalized for storage. */
function normalizeRequiredText(value: string) {
  return value.trim();
}

/** Target set ids normalized before rename checks. */
function normalizeSetId(value: string) {
  return value.trim();
}

/** Deduplicated localization rows ready for persistence. */
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

/** Localization rows grouped by set id for list and detail views. */
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

/** API profile converted from one set row plus localizations. */
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

/** In-memory filter match for the current list query. */
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

/** Localization rows loaded for the requested set ids. */
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

/** Stored set row loaded by set id. */
async function loadSetRow(tx: DbTx, setId: string) {
  return await tx.select()
    .from(HearthstoneSet)
    .where(eq(HearthstoneSet.setId, setId))
    .then(items => items[0]);
}

/** Target set id conflict checked before rename. */
async function assertSetRenameTargetAvailable(tx: DbTx, originalSetId: string, nextSetId: string) {
  if (originalSetId === nextSetId) {
    return;
  }

  const existingSet = await tx.select({
    setId: HearthstoneSet.setId,
  })
    .from(HearthstoneSet)
    .where(eq(HearthstoneSet.setId, nextSetId))
    .then(items => items[0]);

  if (existingSet) {
    throw new ORPCError('CONFLICT', {
      message: `Set ${nextSetId} already exists`,
    });
  }

  const existingLocalization = await tx.select({
    setId: HearthstoneSetLocalization.setId,
  })
    .from(HearthstoneSetLocalization)
    .where(eq(HearthstoneSetLocalization.setId, nextSetId))
    .then(items => items[0]);

  if (existingLocalization) {
    throw new ORPCError('CONFLICT', {
      message: `Set ${nextSetId} already has localization rows`,
    });
  }
}

/** Stored set id references renamed across Hearthstone tables. */
async function syncSetIdReferences(tx: DbTx, originalSetId: string, nextSetId: string) {
  if (originalSetId === nextSetId) {
    return;
  }

  await tx.update(BaseEntity)
    .set({ set: nextSetId })
    .where(eq(BaseEntity.set, originalSetId));

  await tx.update(AnnouncementItem)
    .set({ setId: nextSetId })
    .where(eq(AnnouncementItem.setId, originalSetId));
}

/** Set profile updated with optional setId rename and reference sync. */
export async function updateSetProfile(input: SetUpdateInput): Promise<SetProfile> {
  const localization = normalizeLocalization(input.localization);
  const originalSetId = normalizeSetId(input.originalSetId);
  const nextSetId = normalizeSetId(input.setId);

  return await db.transaction(async tx => {
    const existing = await loadSetRow(tx, originalSetId);

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Set not found' });
    }

    await assertSetRenameTargetAvailable(tx, originalSetId, nextSetId);

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

    await syncSetIdReferences(tx, originalSetId, nextSetId);

    await tx.delete(HearthstoneSetLocalization)
      .where(eq(HearthstoneSetLocalization.setId, originalSetId));

    if (localization.length > 0) {
      await tx.insert(HearthstoneSetLocalization)
        .values(localization.map(item => ({
          setId: nextSetId,
          lang:  item.lang,
          name:  item.name,
        })));
    }

    const row = await loadSetRow(tx, nextSetId);

    if (!row) {
      throw new ORPCError('NOT_FOUND', { message: 'Set not found' });
    }

    return toProfile(row, localization);
  });
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
  .handler(async ({ input }) => await updateSetProfile(input));

export const setTrpc = {
  list,
  get,
  update,
};
