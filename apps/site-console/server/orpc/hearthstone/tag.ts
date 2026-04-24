import { ORPCError } from '@orpc/server';
import { asc, eq } from 'drizzle-orm';

import { db } from '#db/db';
import { Tag } from '#schema/hearthstone';
import {
  tagGetInput,
  tagListInput,
  tagListResult,
  tagProfile,
  tagUpdateInput,
  type TagListInput,
  type TagProfile,
  type TagUpdateInput,
} from '#model/hearthstone/schema/tag';

import { os } from '#server/orpc';

type TagRow = typeof Tag.$inferSelect;

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toProfile(row: TagRow): TagProfile {
  return {
    enumId:             row.enumId,
    slug:               row.slug,
    slugAliases:        row.slugAliases,
    name:               row.name,
    rawName:            row.rawName,
    rawType:            row.rawType,
    rawNames:           row.rawNames,
    valueKind:          row.valueKind,
    normalizeKind:      row.normalizeKind,
    normalizeConfig:    row.normalizeConfig,
    projectTargetType:  row.projectTargetType,
    projectTargetPath:  row.projectTargetPath,
    projectKind:        row.projectKind,
    projectConfig:      row.projectConfig,
    status:             row.status,
    description:        row.description,
    firstSeenSourceTag: row.firstSeenSourceTag,
    lastSeenSourceTag:  row.lastSeenSourceTag,
    createdAt:          toIsoString(row.createdAt),
    updatedAt:          toIsoString(row.updatedAt),
  };
}

function normalizeText(value: string | null) {
  const text = value?.trim();
  return text && text.length > 0 ? text : null;
}

function uniqueTexts(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function matchesSearch(tag: TagProfile, input: TagListInput) {
  const status = input.status?.trim();
  if (status && tag.status !== status) {
    return false;
  }

  const projectKind = input.projectKind?.trim();
  if (projectKind && tag.projectKind !== projectKind) {
    return false;
  }

  const q = input.q?.trim().toLowerCase();
  if (!q) {
    return true;
  }

  const values = [
    String(tag.enumId),
    tag.slug,
    tag.name,
    tag.rawName,
    tag.rawType,
    tag.valueKind,
    tag.normalizeKind,
    tag.projectTargetType,
    tag.projectTargetPath,
    tag.projectKind,
    tag.status,
    tag.description,
    ...tag.slugAliases,
    ...tag.rawNames,
  ];

  return values.some(value => value?.toLowerCase().includes(q));
}

function assertTagUpdate(input: TagUpdateInput) {
  if (input.valueKind === 'enum') {
    throw new ORPCError('BAD_REQUEST', {
      message: 'valueKind=enum is no longer supported; use int + enum_from_int instead',
    });
  }

  if (input.projectTargetPath === 'text' || input.projectTargetPath === 'displayText') {
    throw new ORPCError('BAD_REQUEST', {
      message: 'text and displayText are derived fields; use richText as the projection target',
    });
  }

  if (input.normalizeKind === 'enum_from_int') {
    const enumMap = input.normalizeConfig.enumMap;

    if (typeof enumMap === 'string' && enumMap !== 'set') {
      throw new ORPCError('BAD_REQUEST', {
        message: 'normalizeConfig.enumMap only supports the special string value "set"',
      });
    }

    if (enumMap != null && typeof enumMap !== 'string' && (typeof enumMap !== 'object' || Array.isArray(enumMap))) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'normalizeConfig.enumMap must be an object or the special string value "set"',
      });
    }
  }
}

const list = os
  .route({
    method:      'GET',
    description: 'List Hearthstone tag configurations',
    tags:        ['Console', 'Hearthstone', 'Tag'],
  })
  .input(tagListInput)
  .output(tagListResult)
  .handler(async ({ input }) => {
    const rows = await db.select()
      .from(Tag)
      .orderBy(asc(Tag.enumId));

    const profiles = rows.map(toProfile).filter(tag => matchesSearch(tag, input));
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
    description: 'Get one Hearthstone tag configuration',
    tags:        ['Console', 'Hearthstone', 'Tag'],
  })
  .input(tagGetInput)
  .output(tagProfile)
  .handler(async ({ input }) => {
    const row = await db.select()
      .from(Tag)
      .where(eq(Tag.enumId, input.enumId))
      .then(rows => rows[0]);

    if (!row) {
      throw new ORPCError('NOT_FOUND', { message: 'Tag not found' });
    }

    return toProfile(row);
  });

const update = os
  .route({
    method:      'PUT',
    description: 'Update one Hearthstone tag configuration',
    tags:        ['Console', 'Hearthstone', 'Tag'],
  })
  .input(tagUpdateInput)
  .output(tagProfile)
  .handler(async ({ input }) => {
    assertTagUpdate(input);

    try {
      const row = await db.update(Tag)
        .set({
          slug:              input.slug.trim(),
          slugAliases:       uniqueTexts(input.slugAliases),
          name:              normalizeText(input.name),
          rawName:           normalizeText(input.rawName),
          rawType:           normalizeText(input.rawType),
          rawNames:          uniqueTexts(input.rawNames),
          valueKind:         input.valueKind.trim(),
          normalizeKind:     input.normalizeKind.trim(),
          normalizeConfig:   input.normalizeConfig,
          projectTargetType: normalizeText(input.projectTargetType),
          projectTargetPath: normalizeText(input.projectTargetPath),
          projectKind:       normalizeText(input.projectKind),
          projectConfig:     input.projectConfig,
          status:            input.status.trim(),
          description:       normalizeText(input.description),
        })
        .where(eq(Tag.enumId, input.enumId))
        .returning()
        .then(rows => rows[0]);

      if (!row) {
        throw new ORPCError('NOT_FOUND', { message: 'Tag not found' });
      }

      return toProfile(row);
    } catch (error) {
      if (error instanceof ORPCError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new ORPCError('BAD_REQUEST', { message: error.message });
      }

      throw error;
    }
  });

export const tagTrpc = {
  list,
  get,
  update,
};
