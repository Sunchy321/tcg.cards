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

/** The ownership classifications a card tag can have in the search manifest. */
export const magicSearchTagOwners = ['card-only', 'print-only', 'overlap'] as const;

export type MagicSearchTagOwner = (typeof magicSearchTagOwners)[number];

export interface MagicSearchManifest {
  dataVersion:    string;
  pgFingerprint?: string;
  releaseHash?:   string;
  typeSymbols:    string[];
  tagOwners:      Record<string, MagicSearchTagOwner>;
}
