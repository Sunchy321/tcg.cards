import type { Locale } from '@tcg-cards/model/src/hearthstone/schema/basic';

import {
  projectExtractedCard,
  type ProjectCardResult,
  type ProjectCardContext,
} from '../project';
import type {
  ExtractedCardRow,
  ExtractedCardTagRow,
  TagRow,
} from '../types';

/** LocString shape stored in extracted_card jsonb columns. */
export interface LocStringFixture {
  m_locValues: string[];
  m_locId:     number;
}

/** Subset of ExtractedCardRow consumed by projection, persisted in fixtures. */
export interface ExtractedCardFixture {
  cardId:                   string;
  dbfId:                    number;
  textBuilderType:          number;
  artistName:               string | null;
  signatureArtistName:      string | null;
  creditsCardName:          string | null;
  watermarkTextureOverride: string | null;
  suggestionWeight:         number;
  changeVersion:            number;
  name:                     LocStringFixture | null;
  textInHand:               LocStringFixture | null;
  flavorText:               LocStringFixture | null;
  howToGetCard:             LocStringFixture | null;
  howToGetGoldCard:         LocStringFixture | null;
  howToGetSignatureCard:    LocStringFixture | null;
  howToGetDiamondCard:      LocStringFixture | null;
  targetArrowText:          LocStringFixture | null;
}

/** Subset of ExtractedCardTagRow consumed by projection, persisted in fixtures. */
export interface ExtractedCardTagFixture {
  dbfId:             number;
  tagId:             number;
  tagValue:          number;
  isReferenceTag:    boolean;
  isPowerKeywordTag: boolean;
}

/** Subset of TagRow consumed by projection, persisted in fixtures. */
export interface TagFixture {
  enumId:            number;
  slug:              string;
  normalizeKind:     string;
  normalizeConfig:   Record<string, unknown>;
  projectTargetType: string | null;
  projectTargetPath: string | null;
  projectKind:       string | null;
  projectConfig:     Record<string, unknown>;
}

/** Serializable input snapshot for one card at one build. */
export interface CardProjectionInput {
  build:   number;
  card:    ExtractedCardFixture;
  tags:    ExtractedCardTagFixture[];
  /** Keyed by tag enumId (stringified). */
  tagMap:  Record<string, TagFixture>;
  context: {
    /** Keyed by stringified dbfId. */
    cardIdByDbfId:           Record<string, string>;
    setIdByDbfId:            Record<string, string>;
    hsdataSetByDbfId:        Record<string, number>;
    nameByDbfIdByLocale:     Record<string, Record<string, string>>;
    richTextByDbfIdByLocale: Record<string, Record<string, string>>;
  };
}

/** Which projected tables a fixture asserts. */
export type ProjectedTable = 'entity' | 'localizations' | 'relations';

export type CardProjectionExpected = Partial<ProjectCardResult>;

/** Rebuilds runtime Maps/rows from a persisted fixture snapshot. */
export function reconstructInput(input: CardProjectionInput): {
  card:    ExtractedCardRow;
  tags:    ExtractedCardTagRow[];
  tagMap:  Map<number, TagRow>;
  build:   number;
  context: ProjectCardContext;
} {
  return {
    card:   input.card as unknown as ExtractedCardRow,
    tags:   input.tags as unknown as ExtractedCardTagRow[],
    tagMap: new Map(
      Object.entries(input.tagMap).map(([key, value]) => [Number(key), value as unknown as TagRow]),
    ),
    build:   input.build,
    context: {
      cardIdByDbfId:           toNumberMap(input.context.cardIdByDbfId),
      setIdByDbfId:            toNumberMap(input.context.setIdByDbfId),
      hsdataSetByDbfId:        toNumberMap(input.context.hsdataSetByDbfId),
      nameByDbfIdByLocale:     toLocaleMap(input.context.nameByDbfIdByLocale),
      richTextByDbfIdByLocale: toLocaleMap(input.context.richTextByDbfIdByLocale),
    },
  };
}

function toNumberMap<V>(record: Record<string, V>): Map<number, V> {
  return new Map(Object.entries(record).map(([key, value]) => [Number(key), value]));
}

function toLocaleMap(record: Record<string, Record<string, string>>): Map<Locale, Map<number, string>> {
  return new Map(
    Object.entries(record).map(([locale, byDbfId]) => [locale as Locale, toNumberMap(byDbfId)]),
  );
}

/** Runs offline projection on a persisted fixture snapshot. */
export function runProjection(input: CardProjectionInput): ProjectCardResult {
  const { card, tags, tagMap, build, context } = reconstructInput(input);
  return projectExtractedCard(card, tags, tagMap, build, context);
}
