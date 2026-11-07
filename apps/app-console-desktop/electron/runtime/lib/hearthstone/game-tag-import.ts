import { createHash } from 'node:crypto';

import { ORPCError } from '@orpc/server';
import { and, eq } from 'drizzle-orm';

import { applyTagCommit, buildTagRowRevision, buildWinnerRevision, buildClientMutationId, toTagEntityKey, toTagFieldPath } from '@tcg-cards/console-api/lib/hearthstone/tag-commit';
import type {
  DbTx,
  FieldCommitInsert,
  TagQueryDb,
  TagRow,
  TagServiceOptions,
  TagWrite,
} from '@tcg-cards/console-api/lib/hearthstone/tag-commit';
import { FieldWinner, Tag } from '@tcg-cards/db/schema/shared/hearthstone';

import type { GameTagMember } from './game-tag-source';

/** One existing tag whose primary game name differs from the source snapshot. */
export interface GameTagNameChange {
  enumId:       number;
  currentName:  string | null;
  incomingName: string;
}

/** Names that one source snapshot adds to an existing tag's searchable names. */
export interface GameTagAliasUpdate {
  enumId:       number;
  names:        string[];
  deduplicated: boolean;
}

/** Multiple source declarations that share one tag ID. */
export interface GameTagDuplicateGroup {
  enumId: number;
  names:  string[];
}

/** Read-only comparison and exact source snapshot shown before an import. */
export interface GameTagImportPreview {
  members:             GameTagMember[];
  sourceMemberCount:   number;
  uniqueIdCount:       number;
  addedCount:          number;
  mainNameChangeCount: number;
  aliasUpdateCount:    number;
  unchangedCount:      number;
  retainedDbCount:     number;
  nameChanges:         GameTagNameChange[];
  aliasUpdates:        GameTagAliasUpdate[];
  duplicateGroups:     GameTagDuplicateGroup[];
}

/** Row counts produced by one successful local GAME_TAG import. */
export interface GameTagImportResult {
  addedCount:          number;
  updatedCount:        number;
  unchangedCount:      number;
  mainNameChangeCount: number;
  aliasUpdateCount:    number;
}

/** Members grouped in source order with the final declaration as the primary name. */
interface GameTagGroup {
  enumId:  number;
  members: GameTagMember[];
  names:   string[];
  rawName: string;
}

/** Serializes JSON values with stable key order for source revision hashes. */
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

/** Hashes a source base value into the stable revision format used by tag commits. */
function hashRevision(value: unknown) {
  return `sha256:${createHash('sha256').update(stableStringify(value), 'utf8').digest('hex')}`;
}

/** Validates the exact ordered member snapshot before preview or persistence. */
function assertGameTagMembers(members: GameTagMember[]) {
  if (members.length === 0) {
    throw new ORPCError('BAD_REQUEST', { message: 'The game tag source is empty' });
  }

  const names = new Set<string>();
  for (const [index, member] of members.entries()) {
    if (!Number.isInteger(member.enumId)
      || member.enumId < -2147483648
      || member.enumId > 2147483647
      || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(member.rawName)
      || member.declarationIndex !== index
      || names.has(member.rawName)) {
      throw new ORPCError('BAD_REQUEST', { message: 'The game tag source snapshot is invalid' });
    }

    names.add(member.rawName);
  }
}

/** Groups a validated source snapshot while preserving declaration order. */
function groupGameTagMembers(members: GameTagMember[]): GameTagGroup[] {
  const groups = new Map<number, GameTagGroup>();

  for (const member of members) {
    const group = groups.get(member.enumId);
    if (group) {
      group.members.push(member);
      group.names.push(member.rawName);
      group.rawName = member.rawName;
    } else {
      groups.set(member.enumId, {
        enumId:  member.enumId,
        members: [member],
        names:   [member.rawName],
        rawName: member.rawName,
      });
    }
  }

  return [...groups.values()].sort((left, right) => left.enumId - right.enumId);
}

/** Builds the complete tag state used when a previously unknown ID is created. */
function buildNewTagWrite(group: GameTagGroup, slug: string): TagWrite {
  return {
    slug,
    slugAliases:       [],
    name:              group.rawName,
    rawName:           group.rawName,
    rawType:           null,
    rawNames:          [...new Set(group.names)],
    normalizeKind:     'identity_int',
    normalizeConfig:   {},
    projectTargetType: 'entity',
    projectTargetPath: 'mechanics',
    projectKind:       'assign_mechanic',
    projectConfig:     {},
    status:            'discovered',
    description:       null,
  };
}

/** Generates the same lowercase underscore slug used by automatic tag discovery. */
function slugify(rawName: string, enumId: number, conflicts: ReadonlySet<string>) {
  const base = rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || `tag_${enumId}`;

  return conflicts.has(base) ? `${base}_${enumId}` : base;
}

/** Builds an automatic row-creation commit for one new game tag. */
function buildRowCreateCommit(enumId: number, write: TagWrite, options: TagServiceOptions): FieldCommitInsert {
  return {
    entityType:             'tag',
    entityKey:              toTagEntityKey(enumId),
    fieldPath:              'tag',
    value:                  write,
    operation:              'set',
    commitKind:             'row_create',
    clientMutationId:       buildClientMutationId(enumId, `game_tag:row_create:${Date.now()}`),
    editorRuntime:          options.editorRuntime,
    editorIdentity:         options.editorIdentity,
    editorSource:           options.editorSource,
    expectedRowRevision:    '',
    expectedWinnerRevision: null,
    baseRevision:           hashRevision({
      entityType:            'tag',
      entityKey:             toTagEntityKey(enumId),
      fieldPath:             'tag',
      resolvedBaseValue:     write,
      resolvedSource:        'auto:game_tag',
      resolutionMode:        'rule_auto',
      resolutionFingerprint: 'hearthstone-game-tag-import:v1',
    }),
    reviewStatus:     'auto_approved',
    reviewedBy:       null,
    reviewedAt:       null,
    reviewReason:     null,
    projectionStatus: 'pending',
    syncStatus:       options.syncStatus,
    createdAt:        new Date(),
    projectedAt:      null,
  };
}

/** Builds one automatic field commit with the current row and winner revisions. */
function buildFieldCommit(
  enumId: number,
  field: 'rawName' | 'rawNames',
  value: string | string[],
  current: TagRow,
  winner: typeof FieldWinner.$inferSelect | undefined,
  options: TagServiceOptions,
): FieldCommitInsert {
  const fieldPath = toTagFieldPath(field);
  return {
    entityType:             'tag',
    entityKey:              toTagEntityKey(enumId),
    fieldPath,
    value,
    operation:              'set',
    commitKind:             'source_edit',
    clientMutationId:       buildClientMutationId(enumId, `game_tag:${fieldPath}:${Date.now()}`),
    editorRuntime:          options.editorRuntime,
    editorIdentity:         options.editorIdentity,
    editorSource:           options.editorSource,
    expectedRowRevision:    buildTagRowRevision(current),
    expectedWinnerRevision: buildWinnerRevision(winner),
    baseRevision:           hashRevision({
      entityType:            'tag',
      entityKey:             toTagEntityKey(enumId),
      fieldPath,
      resolvedBaseValue:     value,
      resolvedSource:        'auto:game_tag',
      resolutionMode:        'rule_auto',
      resolutionFingerprint: 'hearthstone-game-tag-import:v1',
    }),
    reviewStatus:     'auto_approved',
    reviewedBy:       null,
    reviewedAt:       null,
    reviewReason:     null,
    projectionStatus: 'pending',
    syncStatus:       options.syncStatus,
    createdAt:        new Date(),
    projectedAt:      null,
  };
}

/** Marks the active winner as GAME_TAG-sourced after the shared commit pipeline applies it. */
async function markGameTagWinner(tx: DbTx, enumId: number, field: 'rawName' | 'rawNames') {
  const winner = await tx.select()
    .from(FieldWinner)
    .where(and(
      eq(FieldWinner.entityType, 'tag'),
      eq(FieldWinner.status, 'active'),
      eq(FieldWinner.entityKey, toTagEntityKey(enumId)),
      eq(FieldWinner.fieldPath, toTagFieldPath(field)),
    ))
    .then(rows => rows[0]);

  if (!winner) {
    throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Failed to persist game tag winner' });
  }

  await tx.update(FieldWinner)
    .set({ winnerSource: 'auto:game_tag' })
    .where(eq(FieldWinner.id, winner.id));
}

/** Builds a read-only preview, including additions, name changes, and retained local IDs. */
export async function previewGameTagImport(
  db: TagQueryDb,
  members: GameTagMember[],
): Promise<GameTagImportPreview> {
  assertGameTagMembers(members);
  const groups = groupGameTagMembers(members);
  const rows = await db.select().from(Tag);
  const rowsById = new Map(rows.map(row => [row.enumId, row]));
  const sourceIds = new Set(groups.map(group => group.enumId));
  const nameChanges: GameTagNameChange[] = [];
  const aliasUpdates: GameTagAliasUpdate[] = [];
  let addedCount = 0;
  let unchangedCount = 0;

  for (const group of groups) {
    const current = rowsById.get(group.enumId);
    if (!current) {
      addedCount += 1;
      continue;
    }

    if (current.rawName !== group.rawName) {
      nameChanges.push({
        enumId:       group.enumId,
        currentName:  current.rawName,
        incomingName: group.rawName,
      });
    }

    const currentNames = [...new Set(current.rawNames)];
    const knownNames = new Set(currentNames);
    const addedNames = [...new Set([...(current.rawName ? [current.rawName] : []), ...group.names])]
      .filter(name => !knownNames.has(name));
    const deduplicated = currentNames.length !== current.rawNames.length;
    if (addedNames.length > 0 || deduplicated) {
      aliasUpdates.push({ enumId: group.enumId, names: addedNames, deduplicated });
    }
    if (current.rawName === group.rawName && addedNames.length === 0 && !deduplicated) {
      unchangedCount += 1;
    }
  }

  return {
    members,
    sourceMemberCount:   members.length,
    uniqueIdCount:       groups.length,
    addedCount,
    mainNameChangeCount: nameChanges.length,
    aliasUpdateCount:    aliasUpdates.length,
    unchangedCount,
    retainedDbCount:     rows.filter(row => !sourceIds.has(row.enumId)).length,
    nameChanges,
    aliasUpdates,
    duplicateGroups:     groups
      .filter(group => group.names.length > 1)
      .map(group => ({ enumId: group.enumId, names: group.names })),
  };
}

/** Applies the exact preview snapshot through local row and field commits in one transaction. */
export async function importGameTagMembers(
  tx: DbTx,
  members: GameTagMember[],
  options: TagServiceOptions,
): Promise<GameTagImportResult> {
  assertGameTagMembers(members);
  const groups = groupGameTagMembers(members);
  const rows = await tx.select().from(Tag);
  const rowsById = new Map(rows.map(row => [row.enumId, row]));
  const slugConflicts = new Set(rows.map(row => row.slug));
  let addedCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let mainNameChangeCount = 0;
  let aliasUpdateCount = 0;

  for (const group of groups) {
    const current = rowsById.get(group.enumId);
    if (!current) {
      const slug = slugify(group.rawName, group.enumId, slugConflicts);
      slugConflicts.add(slug);
      const write = buildNewTagWrite(group, slug);
      const created = await applyTagCommit(tx, buildRowCreateCommit(group.enumId, write, options), {
        conflictTarget: options.conflictTarget,
      });
      rowsById.set(group.enumId, created.row);
      addedCount += 1;
      continue;
    }

    const oldNames = [...new Set(current.rawNames)];
    if (current.rawName && !oldNames.includes(current.rawName)) {
      oldNames.push(current.rawName);
    }
    const addedNames = [...new Set(group.names)].filter(name => !oldNames.includes(name));
    const nextRawNames = [...oldNames, ...addedNames];
    const nameChanged = current.rawName !== group.rawName;
    const namesChanged = stableStringify(current.rawNames) !== stableStringify(nextRawNames);

    if (!nameChanged && !namesChanged) {
      unchangedCount += 1;
      continue;
    }

    if (nameChanged) {
      const entityKey = toTagEntityKey(group.enumId);
      const winner = await tx.select()
        .from(FieldWinner)
        .where(and(
          eq(FieldWinner.entityType, 'tag'),
          eq(FieldWinner.status, 'active'),
          eq(FieldWinner.entityKey, entityKey),
          eq(FieldWinner.fieldPath, toTagFieldPath('rawName')),
        ))
        .then(winners => winners[0]);
      const applied = await applyTagCommit(tx, buildFieldCommit(group.enumId, 'rawName', group.rawName, current, winner, options), {
        conflictTarget: options.conflictTarget,
      });
      await markGameTagWinner(tx, group.enumId, 'rawName');
      rowsById.set(group.enumId, applied.row);
      mainNameChangeCount += 1;
    }

    const namesSource = nameChanged
      ? rowsById.get(group.enumId)!
      : current;
    if (namesChanged) {
      const entityKey = toTagEntityKey(group.enumId);
      const winner = await tx.select()
        .from(FieldWinner)
        .where(and(
          eq(FieldWinner.entityType, 'tag'),
          eq(FieldWinner.status, 'active'),
          eq(FieldWinner.entityKey, entityKey),
          eq(FieldWinner.fieldPath, toTagFieldPath('rawNames')),
        ))
        .then(winners => winners[0]);
      const applied = await applyTagCommit(tx, buildFieldCommit(group.enumId, 'rawNames', nextRawNames, namesSource, winner, options), {
        conflictTarget: options.conflictTarget,
      });
      await markGameTagWinner(tx, group.enumId, 'rawNames');
      rowsById.set(group.enumId, applied.row);
      aliasUpdateCount += 1;
    }

    updatedCount += 1;
  }

  return {
    addedCount,
    updatedCount,
    unchangedCount,
    mainNameChangeCount,
    aliasUpdateCount,
  };
}
