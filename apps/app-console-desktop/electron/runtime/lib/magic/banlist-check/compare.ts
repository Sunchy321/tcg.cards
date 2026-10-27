import type { Legality } from '@tcg-cards/model/magic/schema/announcement';

import { loadComparisonData } from './data';
import { fetchOfficialBanlist } from './fetch';
import { groupCardLists } from '../announcement/data/card-groups';
import type { OfficialBanlist, OfficialCardEntry, RestrictionKind } from './types';

/** A local card identity used to resolve names from official pages. */
interface LocalCardName {
  cardId: string;
  names:  string[];
}

/** One official card name that did not resolve to exactly one local card. */
interface UnmatchedCard {
  name:       string;
  kind:       RestrictionKind;
  points:     number | null;
  candidates: string[];
  reason:     'not_found' | 'ambiguous';
}

/** A difference between one official restriction and the replayed local format state. */
interface CardDifference {
  cardId:         string;
  group:          string | null;
  name:           string;
  officialKind:   RestrictionKind | null;
  localStatus:    Legality | null;
  officialPoints: number | null;
  localPoints:    number | null;
}

/** A comparison report that keeps source limitations separate from card differences. */
export interface BanlistComparison {
  formatId:           string;
  status:             'consistent' | 'differences' | 'incomplete' | 'unavailable';
  source:             Pick<OfficialBanlist, 'sourceId' | 'sourceName' | 'url' | 'updatedAt' | 'fetchedAt' | 'notices'>;
  reason:             string | null;
  officialCount:      number | null;
  localCount:         number | null;
  officialOnly:       CardDifference[];
  localOnly:          CardDifference[];
  statusDifferences:  CardDifference[];
  pointsDifferences:  CardDifference[];
  approximateMatches: { cardId: string, officialName: string, localName: string, method: 'front' | 'parentheses' | 'fuzzy' }[];
  unmatched:          UnmatchedCard[];
  groups:             { group: string, description: string, cardCount: number }[];
  manualReview:       OfficialBanlist['scopes'];
  matches:            { cardId: string, entry: OfficialCardEntry, method: 'exact' | 'front' | 'parentheses' | 'fuzzy' | 'group', group?: string }[];
}

/** Builds the read-only comparison between one official page and the replayed local format. */
export async function compareOfficialBanlist(formatId: string): Promise<BanlistComparison> {
  const [official, data] = await Promise.all([fetchOfficialBanlist(formatId), loadComparisonData()]);
  return compareBanlists(formatId, official, data.formats.find(format => format.formatId === formatId), data.localNames, data.groups,
    data.groupEligibility[formatId]);
}

/** Compares parsed official rows with local identities without fetching or changing data. */
export function compareBanlists(
  formatId: string,
  official: OfficialBanlist,
  localFormat: { banlist: { cardId: string, status: Legality, score?: number | null }[] } | undefined,
  localNames: { cardId: string, name: string | null, localizedName: string | null }[],
  groupCards: Record<string, string[]> = groupCardLists,
  eligibleGroupCards?: ReadonlySet<string>,
): BanlistComparison {
  const source = {
    sourceId:   official.sourceId,
    sourceName: official.sourceName,
    url:        official.url,
    updatedAt:  official.updatedAt,
    fetchedAt:  official.fetchedAt,
    notices:    official.notices,
  };
  if (!official.sourceId) {
    return emptyReport(formatId, source, 'unavailable', official.reason);
  }
  if (!official.complete) {
    return emptyReport(formatId, source, 'unavailable', official.reason ?? 'The official list could not be read completely.');
  }
  if (!localFormat) {
    return emptyReport(formatId, source, 'incomplete', 'The local format has not been initialized.');
  }

  const namesByKey = new Map<string, Set<string>>();
  const fronts = new Map<string, Set<string>>();
  const cardById = new Map<string, LocalCardName>();
  for (const row of localNames) {
    const names = [row.name, row.localizedName].filter((name): name is string => Boolean(name));
    cardById.set(row.cardId, { cardId: row.cardId, names });
    for (const name of names) {
      const key = normalizeName(name);
      const identities = namesByKey.get(key) ?? new Set<string>();
      identities.add(row.cardId);
      namesByKey.set(key, identities);
      if (key.includes('//')) {
        const front = key.split('//')[0]!.trim();
        if (front) {
          const aliases = fronts.get(front) ?? new Set<string>();
          aliases.add(row.cardId);
          fronts.set(front, aliases);
        }
      }
    }
  }

  const comparableLocalEntries = localFormat.banlist.filter(entry => [
    'banned', 'banned_in_bo1', 'restricted', 'suspended', 'banned_as_commander', 'banned_as_companion', 'score',
  ].includes(entry.status));
  const localEntries = new Map(comparableLocalEntries.map(entry => [entry.cardId, entry]));
  const matchedOfficial = new Map<string, OfficialCardEntry>();
  const unmatched: UnmatchedCard[] = [];
  const approximateMatches: BanlistComparison['approximateMatches'] = [];
  const matches: BanlistComparison['matches'] = [];
  const pending = new Set(official.entries.filter(entry => entry.name.trim().length > 0));
  // Reserve all exact identities before a typo can consume another row's card.
  for (const mode of ['exact', 'front', 'parentheses', 'fuzzy'] as const) {
    for (const entry of pending) {
      const candidates = nameCandidates(entry.name, namesByKey, fronts, mode);
      if (candidates.length !== 1 || matchedOfficial.has(candidates[0]!)) continue;
      const cardId = candidates[0]!;
      matchedOfficial.set(cardId, entry);
      matches.push({ cardId, entry, method: mode });
      if (mode !== 'exact') {
        approximateMatches.push({ cardId, officialName: entry.name, localName: cardById.get(cardId)!.names[0]!, method: mode });
      }
      pending.delete(entry);
    }
  }
  for (const entry of pending) {
    const exact = nameCandidates(entry.name, namesByKey, fronts, 'exact');
    const withoutNote = nameCandidates(entry.name, namesByKey, fronts, 'parentheses');
    const candidates = exact.length ? exact : withoutNote.length ? withoutNote : nameCandidates(entry.name, namesByKey, fronts, 'fuzzy');
    unmatched.push({
      name:   entry.name,
      kind:   entry.kind,
      points: entry.points,
      candidates,
      reason: candidates.length === 0 ? 'not_found' : 'ambiguous',
    });
  }

  const groups: BanlistComparison['groups'] = [];
  const manualReview: OfficialBanlist['scopes'] = [];
  for (const scope of official.scopes) {
    const allMembers = scope.group == null ? undefined : groupCards[scope.group];
    if (!scope.group || !allMembers?.length) {
      manualReview.push(scope);
      continue;
    }
    const members = allMembers.filter(cardId => eligibleGroupCards == null || eligibleGroupCards.has(cardId));
    groups.push({ group: scope.group, description: scope.description, cardCount: new Set(members).size });
    // Expand the official rule independently of local bans so missing members and wrong statuses remain visible.
    for (const cardId of members) {
      if (!matchedOfficial.has(cardId)) {
        const entry: OfficialCardEntry = { name: cardById.get(cardId)?.names[0] ?? cardId, kind: 'banned', points: null, note: scope.description };
        matchedOfficial.set(cardId, entry);
        matches.push({ cardId, entry, method: 'group', group: scope.group });
      }
    }
  }

  const officialOnly: CardDifference[] = [];
  const localOnly: CardDifference[] = [];
  const statusDifferences: CardDifference[] = [];
  const pointsDifferences: CardDifference[] = [];
  const groupByCard = new Map(Object.entries(groupCards).flatMap(([group, members]) => members.map(cardId => [cardId, group] as const)));
  const cardIds = new Set([...matchedOfficial.keys(), ...localEntries.keys()]);
  for (const cardId of cardIds) {
    const officialEntry = matchedOfficial.get(cardId);
    const localEntry = localEntries.get(cardId);
    const difference: CardDifference = {
      cardId,
      group:          groupByCard.get(cardId) ?? null,
      name:           cardById.get(cardId)?.names[0] ?? officialEntry?.name ?? cardId,
      officialKind:   officialEntry?.kind ?? null,
      localStatus:    localEntry?.status ?? null,
      officialPoints: officialEntry?.points ?? null,
      localPoints:    localEntry?.score ?? null,
    };

    if (officialEntry && !localEntry) {
      officialOnly.push(difference);
    } else if (!officialEntry && localEntry) {
      localOnly.push(difference);
    } else if (officialEntry && localEntry) {
      const officialStatus = statusForKind(officialEntry.kind);
      if (officialStatus != null && localEntry.status !== officialStatus) statusDifferences.push(difference);
      if (officialEntry.points != null && localEntry.score !== officialEntry.points) pointsDifferences.push(difference);
    }
  }

  if (official.entries.some(entry => statusForKind(entry.kind) == null && entry.kind !== 'points')) {
    manualReview.push({ description: 'Some official restriction categories have no matching local status.', expanded: false });
  }
  const hasDifferences = officialOnly.length + localOnly.length + statusDifferences.length + pointsDifferences.length > 0;
  const incomplete = unmatched.length > 0 || manualReview.some(scope => !scope.expanded);
  return {
    formatId,
    status:        incomplete ? 'incomplete' : hasDifferences ? 'differences' : 'consistent',
    source,
    officialCount: matchedOfficial.size + unmatched.length,
    localCount:    localEntries.size,
    reason:        incomplete
      ? 'Some official entries or rule-defined card ranges could not be fully compared.'
      : null,
    officialOnly,
    localOnly,
    statusDifferences,
    pointsDifferences,
    approximateMatches,
    matches,
    groups,
    unmatched,
    manualReview,
  };
}

/** Returns a report with empty comparison categories when no safe comparison is possible. */
function emptyReport(
  formatId: string,
  source: BanlistComparison['source'],
  status: 'incomplete' | 'unavailable',
  reason: string | null,
): BanlistComparison {
  return {
    formatId, status, source, reason, officialCount:      null, localCount:         null,
    officialOnly:       [], localOnly:          [], statusDifferences:  [], pointsDifferences:  [], approximateMatches: [], matches:            [], groups:             [], unmatched:          [], manualReview:       [],
  };
}

/** Normalizes typography without discarding meaningful card-name punctuation. */
function normalizeName(name: string): string {
  return name.normalize('NFKC').replace(/[‘’ʼ]/g, '\'').replace(/[‐‑‒–—]/g, '-').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en');
}

/** Removes parenthetical and trailing restriction notes after full-name matching fails. */
function withoutNotes(name: string): string {
  let result = name;
  while (/\([^()]*\)/.test(result)) result = result.replace(/\([^()]*\)/g, ' ');
  return normalizeName(result).replace(/\s+-\s+only banned as (?:a )?(?:companion|commander)\b.*$/i, '').trim();
}

/** Resolves one row at a time while retaining all equally plausible identities. */
function nameCandidates(name: string, index: Map<string, Set<string>>, fronts: Map<string, Set<string>>, mode: 'exact' | 'front' | 'parentheses' | 'fuzzy'): string[] {
  const key = normalizeName(name);
  // An exact but ambiguous or already consumed identity must never fall through to a different card.
  const exact = index.get(key);
  if (exact) return [...exact];
  if (mode === 'exact') return [];
  const front = fronts.get(key);
  if (front) return [...front];
  if (mode === 'front') return [];
  const plain = withoutNotes(key);
  const stripped = index.get(plain) ?? fronts.get(plain);
  if (stripped) return [...stripped];
  if (mode === 'parentheses' || !plain) return [];
  const candidates = new Set<string>();
  for (const names of [index, fronts]) {
    for (const [candidate, identities] of names) {
      if (withinOneEdit(plain, candidate)) for (const id of identities) candidates.add(id);
    }
  }
  return [...candidates];
}

/** Accepts one insertion, deletion, substitution, or adjacent transposition. */
function withinOneEdit(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  while (i < left.length && i < right.length && left[i] === right[i]) i++;
  if (i === left.length || i === right.length) return true;
  if (left.length === right.length) {
    return left.slice(i + 1) === right.slice(i + 1)
      || (left[i] === right[i + 1] && left[i + 1] === right[i] && left.slice(i + 2) === right.slice(i + 2));
  }
  return left.length > right.length ? left.slice(i + 1) === right.slice(i) : left.slice(i) === right.slice(i + 1);
}

/** Maps a source category to the local legality value when both models express the same status. */
function statusForKind(kind: RestrictionKind): Legality | null {
  switch (kind) {
  case 'banned': return 'banned';
  case 'banned_in_bo1': return 'banned_in_bo1';
  case 'restricted': return 'restricted';
  case 'suspended': return 'suspended';
  case 'banned_as_commander': return 'banned_as_commander';
  case 'banned_as_companion': return 'banned_as_companion';
  case 'banned_in_deck': return 'banned';
  case 'banned_as_leader': return null;
  case 'points': return null;
  }
}
