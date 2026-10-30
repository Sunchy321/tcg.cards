import type { Locale } from '../schema/basic';

export interface MagicSearchCandidatePrint {
  set:         string;
  number:      string;
  lang:        Locale;
  source:      string;
  releaseDate: string;
}

export type MagicSearchCandidatePrints = Partial<Record<Locale, MagicSearchCandidatePrint>>;

export type MagicSearchTagOwner = 'card-only' | 'print-only' | 'overlap';

export interface MagicSearchManifest {
  dataVersion: string;
  typeSymbols: string[];
  tagOwners:   Record<string, MagicSearchTagOwner>;
}
