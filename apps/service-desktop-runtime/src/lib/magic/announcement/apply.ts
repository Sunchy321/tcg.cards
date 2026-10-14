import { changeStatusByType } from '@tcg-cards/model/magic/schema/announcement';

import { banlistSourceOrder, banlistStatusOrder } from './data/banlist-order';
import { magicEternalFormats, magicRotatingFormats } from './data/format-keywords';
import { magicSeedingSetTypes } from './data/set-seeding';
import { isSentinelCardId, resolveFormats } from './projection';

/** A format row the replay needs: identity plus its validity window. */
export interface ApplyFormatInput {
  formatId:  string;
  birthday:  string | null;
  deathdate: string | null;
}

/** A set row the seeding needs. */
export interface ApplySetInput {
  setId:       string;
  type:        string;
  releaseDate: string | null;
}

/** The authored announcement-item fields the replay applies. `id` keys the returned projection. */
export interface ApplyItemInput {
  id:            string;
  type:          string;
  effectiveDate: string | null;
  format:        string | null;
  status:        string | null;
  score:         number | null;
  group:         string | null;
  cardId:        string | null;
  setId:         string | null;
  ruleId:        string | null;
  relatedCards:  string[];
}

/** An announcement row with its authored items. */
export interface ApplyAnnouncementInput {
  date:          string;
  effectiveDate: string | null;
  items:         ApplyItemInput[];
}

/** Per-card data the sentinel expansion needs: type, print rarities, sets, and earliest release. */
export interface ApplyCardMeta {
  typeMain:    string[];
  rarities:    string[];
  sets:        string[];
  releaseDate: string | null;
}

/** Everything the replay derives from: plain rows plus the resolved sentinel groups and the replay cutoff. */
export interface ApplyInput {
  formats:       ApplyFormatInput[];
  sets:          ApplySetInput[];
  announcements: ApplyAnnouncementInput[];
  cardMeta:      Record<string, ApplyCardMeta>;
  groupCards:    Record<string, string[]>;
  /** set -> cardIds, for the set_change projection fan-out. */
  setCards:      Record<string, string[]>;
  today:         string;
}

/** One banlist entry of a format's derived state. */
export interface ApplyBanlistEntry {
  cardId: string;
  status: string;
  score:  number | null;
  date:   string;
  group:  string | null;
}

/** The derived state of one format after the replay. */
export interface ApplyFormatState {
  formatId: string;
  sets:     string[] | null;
  banlist:  ApplyBanlistEntry[];
}

/** One projected card of an item: its identity, the status applied to it, and when that takes hold. */
export interface ApplyProjectionCard {
  cardId:        string;
  status:        string | null;
  effectiveDate: string | null;
}

/** The derived projection of one announcement item. */
export interface ApplyItemProjection {
  id:         string;
  projection: {
    formats: string[];
    cards:   ApplyProjectionCard[];
  };
}

/** The replay result: every format's new state, every item's projection, and aggregated data problems. */
export interface ApplyResult {
  formats:     ApplyFormatState[];
  projections: ApplyItemProjection[];
  warnings:    string[];
}

const rotatingFormats = new Set<string>(magicRotatingFormats);
const eternalFormats = new Set<string>(magicEternalFormats);
const seedingSetTypes = new Set<string>(magicSeedingSetTypes);

interface FormatState {
  sets:     string[] | null;
  banlist:  Map<string, ApplyBanlistEntry>;
  /** Armed sentinel group bans: every future set-in re-bans the group's newly entering cards. */
  watchers: Map<string, { status: string, score: number | null, itemId: string }>;
}

/** Whether a sentinel group card counts in a format; pauper families filter by print rarity (cards without meta are skipped). */
function pauperEligible(meta: ApplyCardMeta | undefined, formatId: string): boolean {
  if (meta == null) {
    return false;
  }
  if (formatId === 'pauper') {
    return meta.rarities.includes('common');
  }
  if (formatId === 'pauper_commander' || formatId === 'pauper_duelcommander') {
    return meta.typeMain.includes('creature')
      ? (meta.rarities.includes('common') || meta.rarities.includes('uncommon'))
      : meta.rarities.includes('common');
  }
  return true;
}

/**
 * Rebuilds everything derivable from the announcement stream (ADR-0017):
 * seed each format's set rotation from set release data, replay every
 * announcement chronologically inside its birthday/deathdate window —
 * maintaining rotation, banlists, and armed sentinel group bans — and produce
 * both the new format states and every item's projection. Persisting is the
 * caller's job. Data problems collect into warnings instead of aborting.
 */
export function runApply(input: ApplyInput): ApplyResult {
  const warnings: string[] = [];
  const releaseBySet = new Map<string, string>();
  for (const set of input.sets) {
    if (set.releaseDate != null) {
      releaseBySet.set(set.setId, set.releaseDate);
    }
  }

  const state = new Map<string, FormatState>();
  for (const format of input.formats) {
    if (rotatingFormats.has(format.formatId)) {
      // A dead format stops taking sets at its deathdate; pre-birthday sets all entered at birth.
      const seeded = input.sets
        .filter(s => seedingSetTypes.has(s.type) && s.releaseDate != null && s.releaseDate <= input.today)
        .filter(s => format.deathdate == null || (s.releaseDate != null && s.releaseDate <= format.deathdate))
        .sort((a, b) => a.releaseDate! < b.releaseDate! ? -1 : a.releaseDate! > b.releaseDate! ? 1 : a.setId < b.setId ? -1 : 1)
        .map(s => s.setId);
      state.set(format.formatId, { sets: seeded, banlist: new Map(), watchers: new Map() });
    } else {
      state.set(format.formatId, {
        sets:     eternalFormats.has(format.formatId) ? null : [],
        banlist:  new Map(),
        watchers: new Map(),
      });
    }
  }
  const formatWindow = new Map(input.formats.map(f => [f.formatId, f]));
  // Per-item sentinel accumulation: itemId -> group -> the cards the replay applied, keyed for date upserts.
  const sentinelAccumulator = new Map<string, Map<string, ApplyProjectionCard[]>>();

  // A card enters a format with its earliest released set that is in the format at that moment; eternal formats and setless cards fall back to its first release.
  const entryIntoFormat = (cardId: string, formatSets: string[] | null, fallback: string): string => {
    const meta = input.cardMeta[cardId];
    if (meta == null) {
      return fallback;
    }
    if (formatSets != null && formatSets.length > 0) {
      const entries = meta.sets
        .filter(setId => formatSets.includes(setId))
        .map(setId => releaseBySet.get(setId))
        .filter((d): d is string => d != null)
        .sort();
      if (entries.length > 0) {
        return entries[0]!;
      }
    }
    return meta.releaseDate ?? fallback;
  };

  /** Members of a sentinel group eligible in the format; with tracked sets, only cards a set already carries are members. */
  const groupMembersInFormat = (group: string, formatId: string, fs: FormatState, enteringSetId?: string): string[] => {
    return (input.groupCards[group] ?? []).filter(cardId => {
      const meta = input.cardMeta[cardId];
      if (!pauperEligible(meta, formatId)) {
        return false;
      }
      if (enteringSetId != null) {
        return meta?.sets.includes(enteringSetId) ?? false;
      }
      if (fs.sets == null) {
        return true;
      }
      return meta?.sets.some(s => fs.sets!.includes(s)) ?? false;
    });
  };

  const banGroupCard = (fs: FormatState, cardId: string, status: string, score: number | null, group: string, effective: string): string => {
    const entryDate = entryIntoFormat(cardId, fs.sets, effective);
    const date = effective > entryDate ? effective : entryDate;
    fs.banlist.set(cardId, { cardId, status, score, date, group });
    return date;
  };

  const announcements = [...input.announcements].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  for (const announcement of announcements) {
    const announcementEffective = announcement.effectiveDate ?? announcement.date;
    for (const item of announcement.items) {
      const effective = item.effectiveDate ?? announcementEffective;
      if (effective > input.today) {
        continue;
      }
      for (const formatId of resolveFormats(item.format)) {
        const fs = state.get(formatId);
        if (fs == null) {
          warnings.push(`unknown format ${formatId} for item of ${announcement.date}`);
          continue;
        }
        const window = formatWindow.get(formatId)!;
        if (window.birthday != null && effective < window.birthday) {
          continue;
        }
        if (window.deathdate != null && effective > window.deathdate) {
          continue;
        }

        if (item.type === 'set_change') {
          applySetChange(input, entryIntoFormat, sentinelAccumulator, fs, formatId, item, effective, announcement.date, warnings);
        } else if (item.type === 'card_change') {
          applyCardChange(groupMembersInFormat, banGroupCard, sentinelAccumulator, fs, formatId, item, effective, warnings);
        }
        // card_update / rule_change / format_birth / format_death / card_split / card_merge do not touch format state.
      }
    }
  }

  const formats = input.formats.map(f => {
    const fs = state.get(f.formatId)!;
    let sets = fs.sets;
    if (eternalFormats.has(f.formatId) || (sets != null && sets.length === 0)) {
      sets = null;
    }
    const banlist = [...fs.banlist.values()].sort((a, b) => {
      const statusOrder = banlistStatusOrder.indexOf(a.status as typeof banlistStatusOrder[number])
        - banlistStatusOrder.indexOf(b.status as typeof banlistStatusOrder[number]);
      if (statusOrder !== 0) {
        return statusOrder;
      }
      const groupOrder = banlistSourceOrder.indexOf(a.group as typeof banlistSourceOrder[number])
        - banlistSourceOrder.indexOf(b.group as typeof banlistSourceOrder[number]);
      if (groupOrder !== 0) {
        return groupOrder;
      }
      return a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0;
    });
    return { formatId: f.formatId, sets, banlist };
  });

  // Projections: the display index of every item, derived from the same replay.
  // Every card it names carries the item's status and the item's resolved effective
  // date; sentinel expansions override both with the replay's real per-card values.
  const projections: ApplyItemProjection[] = [];
  for (const announcement of input.announcements) {
    const announcementEffective = announcement.effectiveDate ?? announcement.date;
    for (const item of announcement.items) {
      const effective = item.effectiveDate ?? announcementEffective;
      const cards = new Map<string, ApplyProjectionCard>();
      const addCard = (cardId: string) => {
        if (!cards.has(cardId)) {
          cards.set(cardId, { cardId, status: item.status, effectiveDate: effective });
        }
      };
      if (item.cardId != null && !isSentinelCardId(item.cardId)) {
        addCard(item.cardId);
      }
      for (const id of item.relatedCards) {
        addCard(id);
      }
      if (item.type === 'set_change' && item.setId != null) {
        for (const id of input.setCards[item.setId] ?? []) {
          addCard(id);
        }
      }
      projections.push({
        id:         item.id,
        projection: {
          formats: resolveFormats(item.format),
          cards:   [...cards.values()],
        },
      });
    }
  }
  // Sentinel expansions accumulated during the replay merge into their items' projections.
  for (const [itemId, groups] of sentinelAccumulator) {
    const target = projections.find(p => p.id === itemId);
    if (target == null) {
      continue;
    }
    for (const accumulatedCards of groups.values()) {
      for (const card of accumulatedCards) {
        const index = target.projection.cards.findIndex(c => c.cardId === card.cardId);
        if (index === -1) {
          target.projection.cards.push(card);
        } else {
          target.projection.cards[index] = card;
        }
      }
    }
  }

  return { formats, projections, warnings };
}

function applySetChange(
  input: ApplyInput,
  entryIntoFormat: (cardId: string, formatSets: string[] | null, fallback: string) => string,
  sentinelAccumulator: Map<string, Map<string, ApplyProjectionCard[]>>,
  fs: FormatState,
  formatId: string,
  item: ApplyItemInput,
  effective: string,
  announcementDate: string,
  warnings: string[],
): void {
  if (item.setId == null) {
    warnings.push(`set_change without setId in ${announcementDate}`);
    return;
  }
  if (item.status === 'legal') {
    // Eternal formats do not track rotation; a set-in event is a no-op for their state.
    if (fs.sets == null) {
      return;
    }
    if (fs.sets.includes(item.setId)) {
      warnings.push(`set ${item.setId} already in ${formatId}`);
    } else {
      fs.sets.push(item.setId);
      // Armed group bans re-fire: cards the entering set brings in are banned at their entry date.
      for (const [group, watcher] of fs.watchers) {
        const entering = (input.groupCards[group] ?? []).filter(cardId => {
          const meta = input.cardMeta[cardId];
          return meta?.sets.includes(item.setId!) ?? false;
        });
        for (const cardId of entering) {
          if (!pauperEligible(input.cardMeta[cardId], formatId)) {
            continue;
          }
          if (fs.banlist.get(cardId)?.status === watcher.status) {
            continue;
          }
          const entryDate = entryIntoFormat(cardId, fs.sets, effective);
          const date = effective > entryDate ? effective : entryDate;
          fs.banlist.set(cardId, { cardId, status: watcher.status, score: watcher.score, date, group });
          recordSentinelEntry(sentinelAccumulator, watcher.itemId, group, cardId, watcher.status, date);
        }
      }
    }
    return;
  }
  if (item.status === 'unavailable') {
    if (fs.sets == null || !fs.sets.includes(item.setId)) {
      warnings.push(`set ${item.setId} not in ${formatId}`);
      return;
    }
    fs.sets = fs.sets.filter(s => s !== item.setId);
    // Any ban whose card loses its last set in the format is moot: the card leaves with the set.
    // A still-armed group ban re-bans the cards if their set ever returns.
    for (const [cardId, _entry] of [...fs.banlist]) {
      const meta = input.cardMeta[cardId];
      const staysRelevant = meta == null || meta.sets.some(s => fs.sets!.includes(s));
      if (!staysRelevant) {
        fs.banlist.delete(cardId);
      }
    }
    return;
  }
  warnings.push(`invalid set_change status ${item.status} for ${item.setId} in ${formatId}`);
}

function applyCardChange(
  groupMembersInFormat: (group: string, formatId: string, fs: FormatState) => string[],
  banGroupCard: (fs: FormatState, cardId: string, status: string, score: number | null, group: string, effective: string) => string,
  sentinelAccumulator: Map<string, Map<string, ApplyProjectionCard[]>>,
  fs: FormatState,
  formatId: string,
  item: ApplyItemInput,
  effective: string,
  warnings: string[],
): void {
  if (item.cardId == null) {
    warnings.push(`card_change without cardId in ${formatId}`);
    return;
  }
  const status = item.status;
  if (status == null) {
    warnings.push(`card_change without status for ${item.cardId} in ${formatId}`);
    return;
  }
  if (!changeStatusByType.card_change.statuses.includes(status as never)) {
    warnings.push(`invalid card_change status ${status} for ${item.cardId} in ${formatId}`);
    return;
  }

  if (isSentinelCardId(item.cardId)) {
    const group = item.cardId.slice(1);
    if (status === 'legal' || status === 'unavailable') {
      if (!fs.watchers.has(group)) {
        warnings.push(`group ${group} is not armed in ${formatId}`);
        return;
      }
      fs.watchers.delete(group);
      for (const [cardId, entry] of [...fs.banlist]) {
        if (entry.group === group) {
          fs.banlist.delete(cardId);
        }
      }
      return;
    }
    fs.watchers.set(group, { status, score: item.score ?? null, itemId: item.id });
    for (const cardId of groupMembersInFormat(group, formatId, fs)) {
      const appliedDate = banGroupCard(fs, cardId, status, item.score ?? null, group, effective);
      recordSentinelEntry(sentinelAccumulator, item.id, group, cardId, status, appliedDate);
    }
    return;
  }

  if (status === 'legal' || status === 'unavailable') {
    fs.banlist.delete(item.cardId);
    return;
  }
  fs.banlist.set(item.cardId, {
    cardId: item.cardId,
    status,
    score:  item.score ?? null,
    date:   effective,
    group:  item.group ?? null,
  });
}

/** Accumulates one applied sentinel entry: the latest application date wins per (item, group, card). */
function recordSentinelEntry(
  sentinelAccumulator: Map<string, Map<string, ApplyProjectionCard[]>>,
  itemId: string,
  group: string,
  cardId: string,
  status: string | null,
  date: string,
): void {
  const groups = sentinelAccumulator.get(itemId) ?? sentinelAccumulator.set(itemId, new Map()).get(itemId)!;
  const cards = groups.get(group) ?? groups.set(group, []).get(group)!;
  const existing = cards.find(c => c.cardId === cardId);
  if (existing == null) {
    cards.push({ cardId, status, effectiveDate: date });
    return;
  }
  existing.status = status;
  if (existing.effectiveDate == null || date > existing.effectiveDate) {
    existing.effectiveDate = date;
  }
}
