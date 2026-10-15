/** A restriction category published by a format's governing source. */
export type RestrictionKind = 'banned' | 'banned_in_bo1' | 'restricted' | 'suspended' | 'banned_as_commander' | 'banned_as_companion' | 'banned_in_deck' | 'banned_as_leader' | 'points';

/** One explicit card entry read from an official format source. */
export interface OfficialCardEntry {
  name:       string;
  kind:       RestrictionKind;
  points:     number | null;
  note:       string | null;
  evidence?:  SourceRow;
  originUrl?: string;
}

/** A source-defined card range that cannot safely be reduced to explicit names. */
export interface OfficialRuleScope {
  description: string;
  expanded:    boolean;
  originUrl?:  string;
  group?:      'ante' | 'conspiracy' | 'offensive' | 'unfinity';
}

/** Parsed list data and source metadata from one official page. */
export interface OfficialBanlist {
  formatId:          string;
  sourceId:          string;
  sourceName:        string;
  url:               string;
  fetchedAt:         string;
  updatedAt:         string | null;
  entries:           OfficialCardEntry[];
  scopes:            OfficialRuleScope[];
  notices:           string[];
  complete:          boolean;
  reason:            string | null;
  inheritedFormats?: string[];
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

/** One visible source row, with the headings and nearby category text that give it meaning. */
export interface SourceRow {
  ordinal: number;
  element: string;
  text:    string;
  section: string | null;
  lead:    string | null;
}

/** One fetched page shared by all formats using that URL during a report run. */
export interface OfficialPage {
  url:         string;
  fetchedAt:   string;
  httpStatus:  number | null;
  contentType: string | null;
  sha256:      string | null;
  html:        string | null;
  text:        string | null;
  rows:        SourceRow[];
  error:       string | null;
}
