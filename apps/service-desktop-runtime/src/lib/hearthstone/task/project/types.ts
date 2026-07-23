import type { InferSelectModel } from 'drizzle-orm';
import type { ChangeType } from '@tcg-cards/model/src/hearthstone/schema/entity';
import type {
  BaseEntity,
  BaseEntityLocalization,
  BaseEntityRelation,
  ExtractedCard,
  ExtractedCardTag,
  Tag,
} from '@tcg-cards/db/schema/local/hearthstone';

export type JsonMap = Record<string, unknown>;
export type MechanicValue = boolean | number;
export type RowKey = string;

export type EntityRow = Omit<InferSelectModel<typeof BaseEntity>, 'createdAt' | 'updatedAt' | 'deletedAt'>;
export type LocalizationRow = Omit<InferSelectModel<typeof BaseEntityLocalization>, 'createdAt' | 'updatedAt' | 'deletedAt'>;
export type RelationRow = Omit<InferSelectModel<typeof BaseEntityRelation>, 'createdAt' | 'updatedAt' | 'deletedAt'>;
export type ExtractedCardRow = InferSelectModel<typeof ExtractedCard>;
export type ExtractedCardTagRow = InferSelectModel<typeof ExtractedCardTag>;
export type TagRow = InferSelectModel<typeof Tag>;

export type LocalizationlessEntityRow = Omit<EntityRow, 'version'>;
export type LocalizationlessLocalizationRow = Omit<LocalizationRow, 'version'>;

export interface LocalizationDraft {
  name:               string;
  richText:           string;
  targetText:         string | null;
  textInPlay:         string | null;
  howToEarn:          string | null;
  howToEarnGolden:    string | null;
  howToEarnSignature: string | null;
  howToEarnDiamond:   string | null;
  flavorText:         string | null;
  locChangeType:      ChangeType;
}

export interface WritePlanCounts {
  upsert: number;
  delete: number;
}

export interface DiffBreakdown {
  versionMatch:            number;
  versionChanged:          number;
  orphanVersionChanged:    number;
  renderHashChanged?:      number;
  renderHashNullExisting?: number;
}

export interface ProjectReport {
  dryRun:                boolean;
  skipped:               boolean;
  sourceTag:             number;
  build:                 number;
  snapshotCount:         number;
  totalSnapshotCount:    number;
  skippedSnapshotCount:  number;
  insertedEntities:      number;
  reusedEntities:        number;
  updatedEntities:       number;
  insertedLocalizations: number;
  reusedLocalizations:   number;
  updatedLocalizations:  number;
  insertedRelations:     number;
  reusedRelations:       number;
  updatedRelations:      number;
  cardRowCount:          number;
  unprojectedTagCount:   number;
  entityPlan:            WritePlanCounts;
  localizationPlan:      WritePlanCounts;
  relationPlan:          WritePlanCounts;
  entityDiff:            DiffBreakdown;
  localizationDiff:      DiffBreakdown;
  relationDiff:          DiffBreakdown;
  sampleDiffPath:        string | null;
}
