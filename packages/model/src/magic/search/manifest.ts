import type { ImageType, Layout, Locale } from '../schema/basic';
import type { ImageStatus } from '../schema/print';

export interface MagicSearchCandidatePrint {
  set:         string;
  number:      string;
  lang:        Locale;
  source:      string;
  releaseDate: string;
  layout:      Layout;
  imageType:   ImageType;
  imageStatus: ImageStatus;
}

export type MagicSearchCandidatePrints = Partial<Record<Locale, MagicSearchCandidatePrint>>;

export type MagicSearchTagOwner = 'card-only' | 'print-only' | 'overlap';

export interface MagicSearchManifest {
  dataVersion: string;
  typeSymbols: string[];
  tagOwners:   Record<string, MagicSearchTagOwner>;
}
