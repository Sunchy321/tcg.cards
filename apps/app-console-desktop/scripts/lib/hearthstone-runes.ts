import type { Rune } from '@tcg-cards/model/hearthstone/schema/entity';
import { buildRevisionHashPayload, hashCanonicalJson, mergeVersion } from '../../electron/runtime/lib/hearthstone/task/project/hash';
import { entityKey, localizationKey, relationKey } from '../../electron/runtime/lib/hearthstone/task/project/reconcile';
import type { EntityRow, LocalizationRow, RelationRow } from '../../electron/runtime/lib/hearthstone/task/project/types';

/** Maps each rune-cost tag to its repeated rune values without losing quantity. */
export const runeTags = ([
  { enumId: 2196, rune: 'blood' },
  { enumId: 2197, rune: 'frost' },
  { enumId: 2198, rune: 'unholy' },
] satisfies { enumId: number, rune: Rune }[]).map(({ enumId, rune }) => ({
  enumId,
  normalizeKind:   'enum_from_int',
  normalizeConfig: {
    enumMap: {
      0: [],
      1: [rune],
      2: [rune, rune],
      3: [rune, rune, rune],
    },
  },
  projectTargetType: 'entity',
  projectTargetPath: 'rune',
  projectKind:       'append_string_array',
  projectConfig:     {},
  status:            'configured',
}));

/** Merges versions when repairing a tag makes previously distinct revisions identical. */
function mergeRows<T extends { version: number[] }>(rows: T[], keyOf: (row: T) => string): T[] {
  const merged = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    const existing = merged.get(key);
    merged.set(key, { ...row, version: mergeVersion(existing?.version ?? [], row.version) });
  }
  return [...merged.values()];
}

/** Restores misplaced rune costs while preserving every other projected field and version. */
export function repairRuneRows(entities: EntityRow[], localizations: LocalizationRow[], relations: RelationRow[]) {
  const replacements = new Map<string, EntityRow>();
  const repairedEntities = entities.map(row => {
    if (!runeTags.some(tag => Object.hasOwn(row.mechanics, String(tag.enumId)))) {
      return row;
    }

    const { 2196: _blood, 2197: _frost, 2198: _unholy, ...mechanics } = row.mechanics;
    const rune: Rune[] = [];
    for (const tag of runeTags) {
      const value = row.mechanics[String(tag.enumId)];
      if (value != null) {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 3) {
          throw new Error(`Invalid rune cost ${String(value)} on ${row.cardId}, tag ${tag.enumId}.`);
        }
        rune.push(...tag.normalizeConfig.enumMap[value as keyof typeof tag.normalizeConfig.enumMap]);
      }
    }

    const repaired = { ...row, mechanics, rune: rune.length > 0 ? rune : null };
    repaired.revisionHash = hashCanonicalJson(buildRevisionHashPayload(repaired));
    replacements.set(entityKey(row), repaired);
    return repaired;
  });

  const repairedLocalizations = localizations.map(row => {
    const entity = replacements.get(entityKey(row));
    if (entity == null) {
      return row;
    }

    let renderModel = row.renderModel;
    if (renderModel != null) {
      const { rune: _rune, ...rest } = renderModel;
      renderModel = entity.rune == null ? rest : { ...rest, rune: entity.rune };
    }

    return {
      ...row,
      revisionHash: entity.revisionHash,
      renderModel,
      renderHash:   renderModel == null ? null : hashCanonicalJson(renderModel),
    };
  });

  const repairedRelations = relations.map(row => {
    const entity = replacements.get(entityKey({ cardId: row.sourceId, revisionHash: row.sourceRevisionHash }));
    return entity == null ? row : { ...row, sourceRevisionHash: entity.revisionHash };
  });

  return {
    entities:      mergeRows(repairedEntities, entityKey),
    localizations: mergeRows(repairedLocalizations, localizationKey),
    relations:     mergeRows(repairedRelations, relationKey),
  };
}
