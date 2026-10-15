/** A restriction category published by a format's governing source. */
export type RestrictionKind = 'banned' | 'restricted' | 'suspended' | 'banned_as_commander' | 'banned_as_companion' | 'banned_in_deck' | 'banned_as_leader' | 'points';

/** One explicit card entry read from an official format source. */
export interface OfficialCardEntry {
  name:   string;
  kind:   RestrictionKind;
  points: number | null;
  note:   string | null;
}

/** A source-defined card range that cannot safely be reduced to explicit names. */
export interface OfficialRuleScope {
  description: string;
  expanded:    boolean;
}

/** Parsed list data and source metadata from one official page. */
export interface OfficialBanlist {
  formatId:   string;
  sourceId:   string;
  sourceName: string;
  url:        string;
  fetchedAt:  string;
  updatedAt:  string | null;
  entries:    OfficialCardEntry[];
  scopes:     OfficialRuleScope[];
  notices:    string[];
  complete:   boolean;
  reason:     string | null;
}

/** Declares where one or more local formats get their official list. */
export interface OfficialSource {
  id:             string;
  name:           string;
  url:            string;
  formats:        string[];
  parser:         'wizards' | 'commander' | 'oathbreaker' | 'canadian_highlander' | 'duelcommander' | 'conquest' | 'pdh' | 'pdc' | 'leviathan';
  notices?:       string[];
  updatePattern?: RegExp;
}

/** Explains why a local format has no active official source mapping. */
export interface SourceCoverage {
  formatId: string;
  status:   'configured' | 'not_applicable' | 'needs_confirmation';
  reason:   string | null;
}
