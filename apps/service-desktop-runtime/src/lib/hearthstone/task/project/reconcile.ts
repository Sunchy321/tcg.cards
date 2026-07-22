import canonicalize from 'canonicalize';

import type { EntityRow, LocalizationRow, RelationRow, RowKey } from './types';
import { mergeVersion } from './hash';

interface ReconcileResult<T extends { version: number[], isLatest: boolean }> {
  finalRows: T[];
  syncPlan: {
    deleteRows: T[];
    upsertRows: T[];
    inserted:   number;
    updated:    number;
    deleted:    number;
  };
  changed:  boolean;
  inserted: number;
  reused:   number;
  updated:  number;
}

interface ReconcileOptions<T extends { version: number[], isLatest: boolean }> {
  build:        number;
  keyOf:        (row: T) => RowKey;
  groupKey:     (row: T) => string;
  stateOf:      (row: T) => string;
  globalLatest: number;
}

function cloneReconcileRow<T extends { version: number[], isLatest: boolean }>(row: T): T {
  return {
    ...row,
    version: [...row.version],
  };
}

export function entityKey(row: Pick<EntityRow, 'cardId' | 'revisionHash'>): RowKey {
  return `${row.cardId}\x00${row.revisionHash}`;
}

export function localizationKey(
  row: Pick<LocalizationRow, 'cardId' | 'lang' | 'revisionHash' | 'localizationHash'>,
): RowKey {
  return `${row.cardId}\x00${row.lang}\x00${row.revisionHash}\x00${row.localizationHash}`;
}

function localizationGroupKey(
  row: Pick<LocalizationRow, 'cardId' | 'lang'>,
): RowKey {
  return `${row.cardId}\x00${row.lang}`;
}

export function relationKey(
  row: Pick<RelationRow, 'sourceId' | 'sourceRevisionHash' | 'relation' | 'targetId'>,
): RowKey {
  return `${row.sourceId}\x00${row.sourceRevisionHash}\x00${row.relation}\x00${row.targetId}`;
}

function entityState(row: Pick<EntityRow, 'revisionHash' | 'version' | 'isLatest'>): string {
  return `${row.revisionHash}\x00${row.version.join(',')}\x00${row.isLatest ? 1 : 0}`;
}

function localizationState(row: Pick<LocalizationRow, 'revisionHash' | 'localizationHash' | 'renderHash' | 'version' | 'isLatest'>): string {
  return [
    row.revisionHash,
    row.localizationHash,
    row.renderHash ?? '',
    row.version.join(','),
  ].join('\x00');
}

function relationState(row: RelationRow): string {
  return [
    row.sourceRevisionHash,
    row.relation,
    row.targetId,
    row.version.join(','),
    row.isLatest ? '1' : '0',
  ].join('\x00');
}

export async function reconcileRows<T extends { version: number[], isLatest: boolean }>(
  existingRows: T[],
  targetRows: T[],
  options: ReconcileOptions<T>,
): Promise<ReconcileResult<T>> {
  const existingByKey = new Map(existingRows.map(row => [options.keyOf(row), row]));
  const finalByKey = new Map<RowKey, T>();

  const targetBuildsByGroup = new Map<string, Set<number>>();
  for (const row of targetRows) {
    const group = options.groupKey(row);
    const builds = targetBuildsByGroup.get(group);
    if (builds) {
      for (const v of row.version) builds.add(v);
    } else {
      targetBuildsByGroup.set(group, new Set(row.version));
    }
  }

  for (const row of existingRows) {
    const groupTargetBuilds = targetBuildsByGroup.get(options.groupKey(row));
    const nextVersion = row.version.filter(value => {
      if (value === options.build) return false;
      if (groupTargetBuilds?.has(value)) return false;
      return true;
    });

    if (nextVersion.length === 0) {
      continue;
    }

    finalByKey.set(options.keyOf(row), {
      ...cloneReconcileRow(row),
      version:  nextVersion,
      isLatest: false,
    });
  }

  let inserted = 0;
  let reused = 0;
  let updated = 0;

  for (const row of targetRows) {
    const key = options.keyOf(row);
    const existing = existingByKey.get(key);
    const current = finalByKey.get(key);

    if (!existing) {
      inserted += 1;
      finalByKey.set(key, {
        ...cloneReconcileRow(row),
        version:  [...row.version],
        isLatest: false,
      });
    } else {
      if (existing.version.includes(options.build)) {
        reused += 1;
      } else {
        updated += 1;
      }

      finalByKey.set(key, {
        ...(current ?? cloneReconcileRow(row)),
        ...cloneReconcileRow(row),
        version:  mergeVersion(current?.version ?? [], ...row.version),
        isLatest: false,
      });
    }
  }

  const finalRows = [...finalByKey.values()];
  const deleteRows: T[] = [];
  const upsertRows: T[] = [];
  let syncInserted = 0;
  let syncUpdated = 0;

  for (const row of existingRows) {
    const key = options.keyOf(row);

    if (!finalByKey.has(key)) {
      deleteRows.push(row);
    }
  }

  for (const row of finalRows) {
    const key = options.keyOf(row);
    const existing = existingByKey.get(key);
    const currentState = options.stateOf(row);
    const previousState = existing == null ? null : options.stateOf(existing);

    const existingRM = existing != null ? (existing as Record<string, unknown>).renderModel : undefined;
    const targetRM = (row as Record<string, unknown>).renderModel;
    const renderModelCanonicalMismatch = targetRM != null
      && (existingRM == null || canonicalize(existingRM) !== canonicalize(targetRM));

    if (currentState === previousState && !renderModelCanonicalMismatch) {
      continue;
    }

    if (existing == null) {
      syncInserted += 1;
    } else {
      syncUpdated += 1;
    }

    upsertRows.push(row);
  }

  const changed = deleteRows.length > 0 || upsertRows.length > 0;
  const syncPlan = {
    deleteRows,
    upsertRows,
    inserted: syncInserted,
    updated:  syncUpdated,
    deleted:  deleteRows.length,
  };

  return {
    finalRows,
    syncPlan,
    changed,
    inserted,
    reused,
    updated,
  };
}

type EntityStateRow = Pick<EntityRow, 'cardId' | 'version' | 'revisionHash' | 'isLatest'>;
type LocalizationStateRow = Pick<LocalizationRow, 'cardId' | 'version' | 'lang' | 'revisionHash' | 'localizationHash' | 'renderHash' | 'isLatest'> & { renderModel?: unknown };

export async function reconcileEntities(
  existing: EntityStateRow[],
  target: EntityStateRow[],
  build: number,
  globalLatest: number,
) {
  return reconcileRows(existing, target, {
    build,
    keyOf:    entityKey,
    groupKey: row => row.cardId,
    stateOf:  entityState,
    globalLatest,
  });
}

export async function reconcileLocalizations(
  existing: LocalizationStateRow[],
  target: LocalizationStateRow[],
  build: number,
  globalLatest: number,
) {
  return reconcileRows(existing, target, {
    build,
    keyOf:    localizationKey,
    groupKey: localizationGroupKey,
    stateOf:  localizationState,
    globalLatest,
  });
}

export async function reconcileRelations(
  existing: RelationRow[],
  target: RelationRow[],
  build: number,
  globalLatest: number,
) {
  return reconcileRows(existing, target, {
    build,
    keyOf:    relationKey,
    groupKey: row => row.sourceId,
    stateOf:  relationState,
    globalLatest,
  });
}
