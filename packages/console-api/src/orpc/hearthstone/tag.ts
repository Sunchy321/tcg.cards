import { createHash } from 'node:crypto';

import { ORPCError, os as create } from '@orpc/server';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@tcg-cards/db/db';
import { FieldCommit, FieldWinner } from '@tcg-cards/db/schema/shared/hearthstone';
import { Tag } from '@tcg-cards/db/schema/shared/hearthstone/tag';
import {
  fieldCommitGetInput,
  fieldCommitListInput,
  fieldCommitListResult,
  fieldCommitProfile,
  type FieldCommitListInput,
  type FieldCommitProfile,
} from '@tcg-cards/model/src/field-commit';
import {
  tagConflictGetInput,
  tagConflictListInput,
  tagConflictListResult,
  tagConflictProfile,
  tagConflictResolveInput,
  tagGetInput,
  tagListInput,
  tagListResult,
  tagProfile,
  tagUpdateInput,
  type TagListInput,
  type TagProfile,
  type TagUpdateInput,
} from '@tcg-cards/model/src/hearthstone/schema/tag';
import {
  applyTagCommit,
  buildFallbackBaseRevision,
  buildTagRowRevision,
  buildWinnerRevision,
  toTagEntityKey,
  toTagFieldPath,
  type FieldCommitInsert,
  type FieldWinnerRow,
  type TagRow,
  type TagWrite,
} from '../../lib/hearthstone/tag-commit';
import {
  getTagConflict,
  listTagConflicts,
  resolveTagConflict,
} from '../../lib/hearthstone/tag-conflict';
import type { ConsoleApiRequestMeta } from '../../request-meta';

const os = create.$context<{ meta?: ConsoleApiRequestMeta }>();

/** Commit rows loaded from the shared field history table. */
type FieldCommitRow = typeof FieldCommit.$inferSelect;

/** One changed field that must be projected into `field_winners` and persisted into commit history. */
type TagFieldDiff = {
  field: keyof TagWrite;
  fieldPath: string;
  value: TagWrite[keyof TagWrite];
  previousWinner?: FieldWinnerRow;
};

const editableFields: Array<keyof TagWrite> = [
  'slug',
  'slugAliases',
  'name',
  'rawName',
  'rawType',
  'rawNames',
  'valueKind',
  'normalizeKind',
  'normalizeConfig',
  'projectTargetType',
  'projectTargetPath',
  'projectKind',
  'projectConfig',
  'status',
  'description',
];

const projectKinds = new Set([
  'assign_value',
  'append_string_array',
  'assign_card_ref',
  'assign_localized_text',
  'assign_mechanic',
  'assign_referenced_tag',
  'assign_legacy',
  'emit_relation',
]);

const projectTargetTypes = new Set([
  'entity',
  'entity_localization',
  'entity_relation',
]);

const enumMapAliases = new Set([
  'set',
  'rarity',
  'multiclass',
  'spell-school',
  'race',
]);

/** Converts one write-mode hint into the persisted sync state. */
function toSyncStatus(mode: ConsoleApiRequestMeta['syncMode']) {
  switch (mode) {
    case 'remote_edit':
      return 'synced';
    case 'pull':
      return 'pulled';
    case 'local_edit':
    default:
      return 'pending_push';
  }
}

/** Maps one request runtime mode to the side and stage that process the commit. */
function toConflictTarget(mode: ConsoleApiRequestMeta['syncMode']) {
  switch (mode) {
    case 'remote_edit':
      return {
        processingSide:  'remote',
        processingStage: 'apply',
      } as const;
    case 'pull':
      return {
        processingSide:  'local',
        processingStage: 'replay',
      } as const;
    case 'local_edit':
    default:
      return {
        processingSide:  'local',
        processingStage: 'apply',
      } as const;
  }
}

/** Resolves the persisted commit metadata from one caller-provided request meta object. */
function resolveCommitMeta(meta: ConsoleApiRequestMeta | undefined) {
  return {
    editorRuntime:  meta?.editorRuntime ?? 'desktop',
    editorIdentity: meta?.editorIdentity ?? null,
    syncStatus:     toSyncStatus(meta?.syncMode),
    conflictTarget: toConflictTarget(meta?.syncMode),
  };
}

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

/** Maps one persisted field commit into the public tag commit shape. */
function toCommitProfile(row: FieldCommitRow): FieldCommitProfile {
  return {
    id:                     row.id,
    sequence:               row.sequence,
    entityType:             row.entityType,
    entityKey:              row.entityKey,
    fieldPath:              row.fieldPath,
    value:                  row.value ?? null,
    operation:              row.operation,
    commitKind:             row.commitKind,
    clientMutationId:       row.clientMutationId,
    editorRuntime:          row.editorRuntime,
    editorIdentity:         row.editorIdentity ?? null,
    expectedRowRevision:    row.expectedRowRevision,
    expectedWinnerRevision: row.expectedWinnerRevision ?? null,
    baseRevision:           row.baseRevision,
    reviewStatus:           row.reviewStatus,
    reviewedBy:             row.reviewedBy ?? null,
    reviewedAt:             row.reviewedAt ? toIsoString(row.reviewedAt) : null,
    reviewReason:           row.reviewReason ?? null,
    projectionStatus:       row.projectionStatus,
    syncStatus:             row.syncStatus,
    createdAt:              toIsoString(row.createdAt),
    projectedAt:            row.projectedAt ? toIsoString(row.projectedAt) : null,
  };
}

function normalizeText(value: string | null) {
  const text = value?.trim();
  return text && text.length > 0 ? text : null;
}

function uniqueTexts(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

/** Normalizes one incoming tag payload into the exact table write shape. */
function normalizeTagWrite(input: TagUpdateInput): TagWrite {
  return {
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
  };
}

/** Extracts the sync-relevant editable fields from one current tag row. */
function rowToTagWrite(row: TagRow): TagWrite {
  return {
    slug:              row.slug,
    slugAliases:       row.slugAliases,
    name:              row.name,
    rawName:           row.rawName,
    rawType:           row.rawType,
    rawNames:          row.rawNames,
    valueKind:         row.valueKind,
    normalizeKind:     row.normalizeKind,
    normalizeConfig:   row.normalizeConfig,
    projectTargetType: row.projectTargetType,
    projectTargetPath: row.projectTargetPath,
    projectKind:       row.projectKind,
    projectConfig:     row.projectConfig,
    status:            row.status,
    description:       row.description,
  };
}

/** Serializes JSON-compatible values with stable key ordering for revision hashing. */
function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

/** Builds one local mutation id that can be matched back during later remote ack. */
function buildClientMutationId(enumId: number, fieldPath: string) {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : createHash('sha256')
      .update(`${enumId}:${fieldPath}:${Date.now()}:${Math.random()}`, 'utf8')
      .digest('hex');

  return `tag:${enumId}:${fieldPath}:${random}`;
}

/** Compares the current row with the incoming write and returns only changed fields. */
function collectTagDiffs(current: TagRow, next: TagWrite, winners: FieldWinnerRow[]) {
  const currentWrite = rowToTagWrite(current);
  const winnerByField = new Map(winners.map(winner => [winner.fieldPath, winner]));

  return editableFields
    .filter(field => stableStringify(currentWrite[field]) !== stableStringify(next[field]))
    .map(field => {
      const fieldPath = toTagFieldPath(field);

      return {
        field,
        fieldPath,
        value: next[field],
        previousWinner: winnerByField.get(fieldPath),
      } satisfies TagFieldDiff;
    });
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

/** Matches one public tag commit profile against the current list filters. */
function matchesCommitFilters(commit: FieldCommitProfile, input: FieldCommitListInput) {
  if (input.entityType && commit.entityType !== input.entityType) {
    return false;
  }

  if (input.entityKey && !matchesEntityKey(commit.entityKey, input.entityKey)) {
    return false;
  }

  const fieldPath = input.fieldPath?.trim();
  if (fieldPath && commit.fieldPath !== fieldPath) {
    return false;
  }

  const commitKind = input.commitKind?.trim();
  if (commitKind && commit.commitKind !== commitKind) {
    return false;
  }

  const reviewStatus = input.reviewStatus?.trim();
  if (reviewStatus && commit.reviewStatus !== reviewStatus) {
    return false;
  }

  const syncStatus = input.syncStatus?.trim();
  if (syncStatus && commit.syncStatus !== syncStatus) {
    return false;
  }

  return true;
}

/** Returns whether one actual entity key contains every filter key/value pair. */
function matchesEntityKey(actual: unknown, expected: Record<string, unknown>) {
  if (typeof actual !== 'object' || actual == null || Array.isArray(actual)) {
    return false;
  }

  const actualKey = actual as Record<string, unknown>;
  return Object.entries(expected).every(([key, value]) => actualKey[key] === value);
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

    if (typeof enumMap === 'string' && !enumMapAliases.has(enumMap)) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'normalizeConfig.enumMap only supports the string aliases "set", "rarity", "multiclass", "spell-school", and "race"',
      });
    }

    if (enumMap != null && typeof enumMap !== 'string' && (typeof enumMap !== 'object' || Array.isArray(enumMap))) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'normalizeConfig.enumMap must be an object or one of the supported string aliases',
      });
    }
  }

  if (input.projectKind != null && !projectKinds.has(input.projectKind)) {
    throw new ORPCError('BAD_REQUEST', {
      message: `Unsupported projectKind: ${input.projectKind}`,
    });
  }

  if (input.projectTargetType != null && !projectTargetTypes.has(input.projectTargetType)) {
    throw new ORPCError('BAD_REQUEST', {
      message: `Unsupported projectTargetType: ${input.projectTargetType}`,
    });
  }

  if (input.projectKind === 'assign_localized_text' && input.projectTargetType !== 'entity_localization') {
    throw new ORPCError('BAD_REQUEST', {
      message: 'assign_localized_text requires projectTargetType=entity_localization',
    });
  }

  if (input.projectKind === 'emit_relation' && input.projectTargetType !== 'entity_relation') {
    throw new ORPCError('BAD_REQUEST', {
      message: 'emit_relation requires projectTargetType=entity_relation',
    });
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

const listCommits = os
  .route({
    method:      'GET',
    description: 'List Hearthstone tag field commits',
    tags:        ['Console', 'Hearthstone', 'Tag'],
  })
  .input(fieldCommitListInput)
  .output(fieldCommitListResult)
  .handler(async ({ input }) => {
    const rows = await db.select()
      .from(FieldCommit)
      .where(eq(FieldCommit.entityType, 'tag'))
      .orderBy(desc(FieldCommit.sequence));

    const profiles = rows.map(toCommitProfile).filter(commit => matchesCommitFilters(commit, input));
    const offset = (input.page - 1) * input.limit;

    return {
      items: profiles.slice(offset, offset + input.limit),
      total: profiles.length,
      page:  input.page,
      limit: input.limit,
    };
  });

const getCommit = os
  .route({
    method:      'GET',
    description: 'Get one Hearthstone tag field commit',
    tags:        ['Console', 'Hearthstone', 'Tag'],
  })
  .input(fieldCommitGetInput)
  .output(fieldCommitProfile)
  .handler(async ({ input }) => {
    const row = await db.select()
      .from(FieldCommit)
      .where(and(
        eq(FieldCommit.id, input.id),
        eq(FieldCommit.entityType, 'tag'),
      ))
      .then(rows => rows[0]);

    if (!row) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Tag commit not found',
      });
    }

    return toCommitProfile(row);
  });

const listConflicts = os
  .route({
    method:      'GET',
    description: 'List Hearthstone tag conflicts',
    tags:        ['Console', 'Hearthstone', 'Tag'],
  })
  .input(tagConflictListInput)
  .output(tagConflictListResult)
  .handler(async ({ input }) => await listTagConflicts(db, input));

const getConflict = os
  .route({
    method:      'GET',
    description: 'Get one Hearthstone tag conflict',
    tags:        ['Console', 'Hearthstone', 'Tag'],
  })
  .input(tagConflictGetInput)
  .output(tagConflictProfile)
  .handler(async ({ input }) => await getTagConflict(db, input.id));

const manualUpdate = os
  .route({
    method:      'PUT',
    description: 'Save one manual Hearthstone tag edit',
    tags:        ['Console', 'Hearthstone', 'Tag'],
  })
  .input(tagUpdateInput)
  .output(tagProfile)
  .handler(async ({ input, context }) => {
    assertTagUpdate(input);

    try {
      const row = await db.transaction(async tx => {
        const current = await tx.select()
          .from(Tag)
          .where(eq(Tag.enumId, input.enumId))
          .then(rows => rows[0]);

        if (!current) {
          throw new ORPCError('NOT_FOUND', { message: 'Tag not found' });
        }

        const next = normalizeTagWrite(input);
        const fieldPaths = editableFields.map(toTagFieldPath);
        const entityKey = toTagEntityKey(input.enumId);
        const existingWinners = await tx.select()
          .from(FieldWinner)
          .where(and(
            eq(FieldWinner.entityType, 'tag'),
            eq(FieldWinner.status, 'active'),
            eq(FieldWinner.entityKey, entityKey),
            inArray(FieldWinner.fieldPath, fieldPaths),
          ));

        const diffs = collectTagDiffs(current, next, existingWinners);

        if (diffs.length === 0) {
          return current;
        }

        const commitMeta = resolveCommitMeta(context.meta);
        let currentRow = current;

        for (const diff of diffs) {
          const commit = {
            entityType:             'tag',
            entityKey,
            fieldPath:              diff.fieldPath,
            value:                  diff.value,
            operation:              'set',
            commitKind:             'source_edit',
            clientMutationId:       buildClientMutationId(input.enumId, diff.fieldPath),
            editorRuntime:          commitMeta.editorRuntime,
            editorIdentity:         commitMeta.editorIdentity,
            expectedRowRevision:    buildTagRowRevision(currentRow),
            expectedWinnerRevision: buildWinnerRevision(diff.previousWinner),
            baseRevision:           diff.previousWinner?.baseRevision ?? buildFallbackBaseRevision(currentRow, diff.field),
            reviewStatus:           'auto_approved',
            reviewedBy:             null,
            reviewedAt:             null,
            reviewReason:           null,
            projectionStatus:       'pending',
            syncStatus:             commitMeta.syncStatus,
            createdAt:              new Date(),
            projectedAt:            null,
          } satisfies FieldCommitInsert;

          const applied = await applyTagCommit(tx, commit, {
            conflictTarget: commitMeta.conflictTarget,
          });
          currentRow = applied.row;
        }

        return currentRow;
      });

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

const resolveConflict = os
  .route({
    method:      'POST',
    description: 'Resolve one Hearthstone tag conflict',
    tags:        ['Console', 'Hearthstone', 'Tag'],
  })
  .input(tagConflictResolveInput)
  .output(tagConflictProfile)
  .handler(async ({ input, context }) => {
    const commitMeta = resolveCommitMeta(context.meta);

    return await resolveTagConflict(db, input, {
      editorRuntime:  commitMeta.editorRuntime,
      editorIdentity: commitMeta.editorIdentity,
      syncStatus:     commitMeta.syncStatus,
      conflictTarget: commitMeta.conflictTarget,
    });
  });

export const tagTrpc = {
  list,
  get,
  listCommits,
  getCommit,
  listConflicts,
  getConflict,
  manualUpdate,
  resolveConflict,
};
