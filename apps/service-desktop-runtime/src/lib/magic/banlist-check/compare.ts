import { and, desc, eq, isNull } from 'drizzle-orm';

import type { Legality } from '@tcg-cards/model/magic/schema/announcement';
import { Card, CardLocalization, Format } from '@tcg-cards/db/schema/local/magic';

import { getLocalDb } from '../../hearthstone/hsdata-local-db';
import { fetchOfficialBanlist } from './fetch';
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
  name:           string;
  officialKind:   RestrictionKind | null;
  localStatus:    Legality | null;
  officialPoints: number | null;
  localPoints:    number | null;
}

/** A comparison report that keeps source limitations separate from card differences. */
export interface BanlistComparison {
  formatId:          string;
  status:            'consistent' | 'differences' | 'incomplete' | 'unavailable';
  source:            Pick<OfficialBanlist, 'sourceId' | 'sourceName' | 'url' | 'updatedAt' | 'fetchedAt' | 'notices'>;
  reason:            string | null;
  officialOnly:      CardDifference[];
  localOnly:         CardDifference[];
  statusDifferences: CardDifference[];
  pointsDifferences: CardDifference[];
  unmatched:         UnmatchedCard[];
  manualReview:      OfficialBanlist['scopes'];
}

/** Builds the read-only comparison between one official page and the replayed local format. */
export async function compareOfficialBanlist(formatId: string): Promise<BanlistComparison> {
  const db = getLocalDb();
  const [official, formatRows, localNames] = await Promise.all([
    fetchOfficialBanlist(formatId),
    db.select({ formatId: Format.formatId, banlist: Format.banlist }).from(Format).where(eq(Format.formatId, formatId)),
    db.selectDistinctOn([Card.cardId], {
      cardId:        Card.cardId,
      name:          Card.name,
      localizedName: CardLocalization.name,
    })
      .from(Card)
      .leftJoin(CardLocalization, and(
        eq(CardLocalization.cardId, Card.cardId),
        eq(CardLocalization.version, Card.version),
        eq(CardLocalization.locale, 'zhs'),
        isNull(CardLocalization.deletedAt),
      ))
      .where(isNull(Card.deletedAt))
      .orderBy(Card.cardId, desc(Card.version), CardLocalization.source),
  ]);

  const localFormat = formatRows[0];
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
  const cardById = new Map<string, LocalCardName>();
  for (const row of localNames) {
    const names = [row.name, row.localizedName].filter((name): name is string => Boolean(name));
    cardById.set(row.cardId, { cardId: row.cardId, names });
    for (const name of names) {
      const key = normalizeName(name);
      const identities = namesByKey.get(key) ?? new Set<string>();
      identities.add(row.cardId);
      namesByKey.set(key, identities);
    }
  }

  const comparableLocalEntries = localFormat.banlist.filter(entry => [
    'banned', 'restricted', 'suspended', 'banned_as_commander', 'banned_as_companion', 'score',
  ].includes(entry.status));
  const localEntries = new Map(comparableLocalEntries.map(entry => [entry.cardId, entry]));
  const matchedOfficial = new Map<string, OfficialCardEntry>();
  const unmatched: UnmatchedCard[] = [];
  for (const entry of official.entries) {
    const candidates = [...(namesByKey.get(normalizeName(entry.name)) ?? [])];
    if (candidates.length !== 1) {
      unmatched.push({
        name:   entry.name,
        kind:   entry.kind,
        points: entry.points,
        candidates,
        reason: candidates.length === 0 ? 'not_found' : 'ambiguous',
      });
      continue;
    }
    const cardId = candidates[0]!;
    const previous = matchedOfficial.get(cardId);
    if (!previous || entry.points != null) matchedOfficial.set(cardId, entry);
  }

  const officialOnly: CardDifference[] = [];
  const localOnly: CardDifference[] = [];
  const statusDifferences: CardDifference[] = [];
  const pointsDifferences: CardDifference[] = [];
  const cardIds = new Set([...matchedOfficial.keys(), ...localEntries.keys()]);
  for (const cardId of cardIds) {
    const officialEntry = matchedOfficial.get(cardId);
    const localEntry = localEntries.get(cardId);
    const difference: CardDifference = {
      cardId,
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

  const manualReview = [...official.scopes];
  if (official.entries.some(entry => statusForKind(entry.kind) == null && entry.kind !== 'points')) {
    manualReview.push({ description: 'Some official restriction categories have no matching local status.', expanded: false });
  }
  const hasDifferences = officialOnly.length + localOnly.length + statusDifferences.length + pointsDifferences.length > 0;
  const incomplete = unmatched.length > 0 || manualReview.some(scope => !scope.expanded);
  return {
    formatId,
    status: incomplete ? 'incomplete' : hasDifferences ? 'differences' : 'consistent',
    source,
    reason: incomplete
      ? 'Some official entries or rule-defined card ranges could not be fully compared.'
      : null,
    officialOnly,
    localOnly,
    statusDifferences,
    pointsDifferences,
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
    formatId, status, source, reason,
    officialOnly: [], localOnly: [], statusDifferences: [], pointsDifferences: [], unmatched: [], manualReview: [],
  };
}

/** Normalizes only spacing and letter case so card matching remains exact. */
function normalizeName(name: string): string {
  return name.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en');
}

/** Maps a source category to the local legality value when both models express the same status. */
function statusForKind(kind: RestrictionKind): Legality | null {
  switch (kind) {
  case 'banned': return 'banned';
  case 'restricted': return 'restricted';
  case 'suspended': return 'suspended';
  case 'banned_as_commander': return 'banned_as_commander';
  case 'banned_as_companion': return 'banned_as_companion';
  case 'banned_in_deck': return 'banned';
  case 'banned_as_leader': return null;
  case 'points': return null;
  }
}
