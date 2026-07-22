import canonicalize from 'canonicalize';

import { RENDER_MECHANIC_IDS } from '@tcg-cards/model/src/hearthstone/constant/tag';
import { renderModel as renderModelSchema, type RenderModel } from '@tcg-cards/model/src/hearthstone/schema/entity';

import type { JsonMap, LocalizationlessEntityRow, LocalizationlessLocalizationRow, MechanicValue } from './types';

const renderMechanicKeys: Set<string> = new Set(RENDER_MECHANIC_IDS);

export function hashCanonicalJson(value: unknown): string {
  return Bun.SHA256.hash(canonicalize(value)!, 'hex') as string;
}

export function mergeVersion(...inputs: Array<number[] | number>): number[] {
  const values = inputs.flatMap(value => Array.isArray(value) ? value : [value]);
  return [...new Set(values)].sort((left, right) => left - right);
}

export function buildRevisionHashPayload(row: LocalizationlessEntityRow): JsonMap {
  return {
    cardId:            row.cardId,
    dbfId:             row.dbfId,
    legacyPayload:     row.legacyPayload,
    set:               row.set,
    classes:           row.classes,
    type:              row.type,
    cost:              row.cost,
    attack:            row.attack,
    health:            row.health,
    durability:        row.durability,
    armor:             row.armor,
    rune:              row.rune,
    race:              row.race,
    spellSchool:       row.spellSchool,
    questType:         row.questType,
    questProgress:     row.questProgress,
    questPart:         row.questPart,
    heroPower:         row.heroPower,
    techLevel:         row.techLevel,
    inBobsTavern:      row.inBobsTavern,
    tripleCard:        row.tripleCard,
    raceBucket:        row.raceBucket,
    armorBucket:       row.armorBucket,
    buddy:             row.buddy,
    bannedRace:        row.bannedRace,
    mercenaryRole:     row.mercenaryRole,
    mercenaryFaction:  row.mercenaryFaction,
    colddown:          row.colddown,
    collectible:       row.collectible,
    elite:             row.elite,
    rarity:            row.rarity,
    artist:            row.artist,
    overrideWatermark: row.overrideWatermark,
    faction:           row.faction,
    mechanics:         row.mechanics,
    referencedTags:    row.referencedTags,
  };
}

export function buildLocalizationHashPayload(row: LocalizationlessLocalizationRow): JsonMap {
  return {
    cardId:             row.cardId,
    lang:               row.lang,
    name:               row.name,
    richText:           row.richText,
    targetText:         row.targetText,
    textInPlay:         row.textInPlay,
    howToEarn:          row.howToEarn,
    howToEarnGolden:    row.howToEarnGolden,
    howToEarnSignature: row.howToEarnSignature,
    howToEarnDiamond:   row.howToEarnDiamond,
    flavorText:         row.flavorText,
  };
}

function isMechanicValue(value: unknown): value is MechanicValue {
  return typeof value === 'boolean' || (typeof value === 'number' && Number.isSafeInteger(value));
}

function getValueAtPath(value: unknown, path: PropertyKey[]): unknown {
  let current = value;

  for (const key of path) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }

    current = (current as Record<PropertyKey, unknown>)[key];
  }

  return current;
}

function formatIssuePath(path: PropertyKey[]): string {
  return path.map(value => String(value)).join('.');
}

export function buildRenderModel(
  entity: LocalizationlessEntityRow,
  localization: LocalizationlessLocalizationRow,
): RenderModel {
  const renderMechanics = Object.fromEntries(
    Object.entries(entity.mechanics)
      .filter(([enumId, value]) => renderMechanicKeys.has(enumId) && isMechanicValue(value)),
  );

  const payload = {
    cardId: entity.cardId,
    lang:   localization.lang,

    templateVersion: 'v1',
    assetVersion:    'v1',

    localization: {
      name:     localization.name,
      richText: localization.richText,
    },

    type:              entity.type,
    cost:              entity.cost,
    attack:            entity.attack,
    health:            entity.health,
    durability:        entity.durability,
    armor:             entity.armor,
    classes:           entity.classes,
    race:              entity.race,
    spellSchool:       entity.spellSchool,
    mercenaryRole:     entity.mercenaryRole,
    mercenaryFaction:  entity.mercenaryFaction,
    colddown:          entity.colddown,
    set:               entity.set,
    overrideWatermark: entity.overrideWatermark,
    rarity:            entity.rarity,
    elite:             entity.elite,
    techLevel:         entity.techLevel,
    rune:              entity.rune,
    renderMechanics,
    textBuilderType:   entity.textBuilderType,
  };

  const stripped = Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v != null),
  );
  const result = renderModelSchema.safeParse(stripped);

  if (!result.success) {
    const issues = result.error.issues.map(issue => ({
      path:    formatIssuePath(issue.path),
      message: issue.message,
      value:   getValueAtPath(payload, issue.path),
    }));

    throw new Error(`[hearthstone][extracted-project] invalid render model for card ${entity.cardId} (${entity.dbfId}) lang ${localization.lang}: ${JSON.stringify(issues)}`);
  }

  return result.data;
}
