import { changeStatusByType } from '@tcg-cards/model/magic/schema/announcement';

import { banlistSourceOrder, banlistStatusOrder } from './data/banlist-order';
import { magicEternalFormats, magicRotatingFormats } from './data/format-keywords';
import { magicSeedingSetTypes } from './data/set-seeding';
import { cloneSourceFormats, isSentinelCardId, resolveFormats } from './projection';

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

/** Card metadata for sentinel eligibility, entry dates, and rotation of individual restrictions. */
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

/** One projected card with its applied status, date, and optional copy metadata. */
export interface ApplyProjectionCard {
  cardId:         string;
  status:         string | null;
  effectiveDate:  string | null;
  score?:         number | null;
  sourceFormats?: string[];
}

/** A restriction removed by rotation in one specific format. */
export interface ApplyDerivedCard extends ApplyProjectionCard {
  formatId: string;
  group:    string | null;
}

/** The derived projection of one announcement item. */
export interface ApplyItemProjection {
  id:         string;
  projection: {
    formats:       string[];
    cards:         ApplyProjectionCard[];
    derivedCards?: ApplyDerivedCard[];
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

/** Dates during which an authored group rule remains active in one format. */
interface GroupWindow {
  start: string;
  end:   string | null;
}

/** Whether a sentinel group card counts in a format; pauper families filter by print rarity (cards without meta are skipped). */
export function pauperEligible(meta: ApplyCardMeta | undefined, formatId: string): boolean {
  if (meta == null) {
    return false;
  }
  if (formatId === 'pauper') {
    return meta.rarities.includes('common');
  }
  if (formatId === 'pauper-commander' || formatId === 'pauper-duelcommander') {
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
  /** Checks format lifetime and excludes implicit set rotation from eternal formats. */
  const itemApplies = (item: ApplyItemInput, formatId: string, effective: string): boolean => {
    const window = formatWindow.get(formatId);
    return window != null
      && (window.birthday == null || effective >= window.birthday)
      && (window.deathdate == null || effective <= window.deathdate)
      && !(item.type === 'set_change' && item.format?.startsWith('#') && eternalFormats.has(formatId));
  };
  // Bound each group rule by its next authored change, before expanding future releases.
  // A direct card change also supersedes an older deferred group result for that card.
  const groupWindows = new Map<string, Map<string, GroupWindow>>();
  const cardChanges = new Map<string, Map<string, string[]>>();
  const activeGroups = new Map<string, Map<string, string>>();
  // Explicit changes in the same announcement take priority over copies regardless of item order.
  const explicitByAnnouncement = new Map<ApplyAnnouncementInput, Map<string, Set<string>>>();
  for (const announcement of input.announcements) {
    const explicit = new Map<string, Set<string>>();
    for (const item of announcement.items) {
      if (item.type !== 'card_change' || item.cardId == null || item.cardId.startsWith('#') || item.status == null) {
        continue;
      }
      const effective = item.effectiveDate ?? announcement.effectiveDate ?? announcement.date;
      for (const formatId of resolveFormats(item.format).filter(id => effective <= input.today && itemApplies(item, id, effective))) {
        const cards = explicit.get(formatId) ?? new Set<string>();
        cards.add(item.cardId);
        explicit.set(formatId, cards);
      }
    }
    explicitByAnnouncement.set(announcement, explicit);
  }
  const events = input.announcements.flatMap(announcement => announcement.items.map(item => ({
    item,
    effective: item.effectiveDate ?? announcement.effectiveDate ?? announcement.date,
  }))).sort((a, b) => a.effective.localeCompare(b.effective));
  for (const { item, effective } of events) {
    if (item.type !== 'card_change' || item.cardId == null || cloneSourceFormats(item.cardId) != null
      || item.status == null || !changeStatusByType.card_change.statuses.includes(item.status as never)) {
      continue;
    }
    for (const formatId of resolveFormats(item.format).filter(id => itemApplies(item, id, effective))) {
      if (isSentinelCardId(item.cardId)) {
        const group = item.cardId.slice(1);
        const windows = groupWindows.get(formatId) ?? new Map<string, GroupWindow>();
        const active = activeGroups.get(formatId) ?? new Map<string, string>();
        const previous = active.get(group);
        if (previous != null) {
          windows.get(previous)!.end = effective;
        }
        windows.set(item.id, { start: effective, end: null });
        active.set(group, item.id);
        groupWindows.set(formatId, windows);
        activeGroups.set(formatId, active);
      } else {
        const changes = cardChanges.get(formatId) ?? new Map<string, string[]>();
        const dates = changes.get(item.cardId) ?? [];
        dates.push(effective);
        changes.set(item.cardId, dates);
        cardChanges.set(formatId, changes);
      }
    }
  }

  /** Whether an older group rule still controls a card on its actual entry date. */
  const groupApplies = (formatId: string, itemId: string, cardId: string, date: string): boolean => {
    const window = groupWindows.get(formatId)?.get(itemId);
    if (window == null || date < window.start || (window.end != null && date >= window.end)) {
      return false;
    }
    const format = formatWindow.get(formatId)!;
    if (format.deathdate != null && date > format.deathdate) {
      return false;
    }
    return !(cardChanges.get(formatId)?.get(cardId) ?? []).some(effective => effective >= window.start && effective <= date);
  };
  // Per-item sentinel accumulation: itemId -> group -> the cards the replay applied, keyed for date upserts.
  const sentinelAccumulator = new Map<string, Map<string, ApplyProjectionCard[]>>();
  const cloneCards = new Map<string, Map<string, ApplyProjectionCard>>();
  const derivedCards = new Map<string, ApplyDerivedCard[]>();

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

  const banGroupCard = (fs: FormatState, cardId: string, status: string, score: number | null, group: string, effective: string, itemId: string, formatId: string): string | null => {
    const entryDate = entryIntoFormat(cardId, fs.sets, effective);
    const date = effective > entryDate ? effective : entryDate;
    if (!groupApplies(formatId, itemId, cardId, date)) {
      return null;
    }
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
        if (!itemApplies(item, formatId, effective)) {
          continue;
        }

        // Explicit set events in eternal formats belong to history, not tracked rotation state.
        if (item.type === 'set_change' && fs.sets != null) {
          applySetChange(input, entryIntoFormat, groupApplies, sentinelAccumulator, derivedCards, fs, formatId, item, effective, announcement.date, warnings);
        } else if (item.type === 'card_change') {
          const sources = item.cardId == null ? null : cloneSourceFormats(item.cardId);
          if (sources != null) {
            if (item.status != null && !changeStatusByType.card_change.statuses.includes(item.status as never)) {
              warnings.push(`invalid card_change status ${item.status} for ${item.cardId} in ${formatId}`);
              continue;
            }
            const explicit = explicitByAnnouncement.get(announcement)?.get(formatId) ?? new Set<string>();
            const candidates = new Map<string, { entry: ApplyBanlistEntry, sourceFormats: string[], conflict: boolean }>();
            for (const sourceId of sources) {
              const source = state.get(sourceId);
              if (source == null) {
                throw new Error(`禁排表来源赛制不存在：${sourceId}`);
              }
              for (const entry of source.banlist.values()) {
                if (explicit.has(entry.cardId)) {
                  continue;
                }
                const candidate = candidates.get(entry.cardId);
                if (candidate != null) {
                  candidate.sourceFormats.push(sourceId);
                  if (candidate.entry.status !== entry.status || candidate.entry.score !== entry.score) {
                    candidate.conflict = true;
                  }
                  continue;
                }
                candidates.set(entry.cardId, { entry, sourceFormats: [sourceId], conflict: false });
              }
            }
            const projected = cloneCards.get(item.id) ?? new Map<string, ApplyProjectionCard>();
            for (const { entry, sourceFormats, conflict } of candidates.values()) {
              if (conflict || fs.banlist.has(entry.cardId)) {
                continue;
              }
              const status = item.status ?? entry.status;
              const score = item.score ?? entry.score;
              if (status !== 'legal' && status !== 'unavailable') {
                fs.banlist.set(entry.cardId, { cardId: entry.cardId, status, score, date: effective, group: entry.group });
              }
              projected.set(entry.cardId, { cardId: entry.cardId, status, score, effectiveDate: effective, sourceFormats });
            }
            cloneCards.set(item.id, projected);
          } else {
            applyCardChange(groupMembersInFormat, banGroupCard, sentinelAccumulator, fs, formatId, item, effective, warnings);
          }
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
      if (item.cardId != null && !isSentinelCardId(item.cardId) && cloneSourceFormats(item.cardId) == null) {
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
          formats: resolveFormats(item.format).filter(formatId => itemApplies(item, formatId, effective)),
          cards:   [...cards.values()],
          ...(derivedCards.has(item.id) ? { derivedCards: derivedCards.get(item.id)! } : {}),
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
  for (const [itemId, cards] of cloneCards) {
    const target = projections.find(p => p.id === itemId);
    if (target != null) {
      target.projection.cards.push(...cards.values());
    }
  }

  return { formats, projections, warnings };
}

/** Updates set membership and card restrictions when cards leave or re-enter a format. */
function applySetChange(
  input: ApplyInput,
  entryIntoFormat: (cardId: string, formatSets: string[] | null, fallback: string) => string,
  groupApplies: (formatId: string, itemId: string, cardId: string, date: string) => boolean,
  sentinelAccumulator: Map<string, Map<string, ApplyProjectionCard[]>>,
  derivedCards: Map<string, ApplyDerivedCard[]>,
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
      // Rotation exclusions expire on re-entry; armed group bans are reapplied below.
      for (const [cardId, entry] of fs.banlist) {
        if (entry.status === 'unavailable' && input.cardMeta[cardId]?.sets.includes(item.setId)) {
          fs.banlist.delete(cardId);
        }
      }
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
          if (!groupApplies(formatId, watcher.itemId, cardId, date)) {
            continue;
          }
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
    // Cards leaving their last legal set no longer belong in the banlist.
    // Reprints in a remaining set retain their restrictions.
    for (const [cardId, entry] of fs.banlist) {
      const meta = input.cardMeta[cardId];
      const staysRelevant = meta == null || meta.sets.some(s => fs.sets!.includes(s));
      if (!staysRelevant) {
        // Preserve the removal as a dated event without retaining it in current state.
        const cards = derivedCards.get(item.id) ?? [];
        cards.push({ formatId, cardId, status: 'unavailable', effectiveDate: effective, group: entry.group });
        derivedCards.set(item.id, cards);
        fs.banlist.delete(cardId);
      }
    }
    return;
  }
  warnings.push(`invalid set_change status ${item.status} for ${item.setId} in ${formatId}`);
}

function applyCardChange(
  groupMembersInFormat: (group: string, formatId: string, fs: FormatState) => string[],
  banGroupCard: (fs: FormatState, cardId: string, status: string, score: number | null, group: string, effective: string, itemId: string, formatId: string) => string | null,
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
          // History needs the same per-card expansion for lifting a group ban.
          recordSentinelEntry(sentinelAccumulator, item.id, group, cardId, status, effective);
          fs.banlist.delete(cardId);
        }
      }
      return;
    }
    fs.watchers.set(group, { status, score: item.score ?? null, itemId: item.id });
    for (const cardId of groupMembersInFormat(group, formatId, fs)) {
      const appliedDate = banGroupCard(fs, cardId, status, item.score ?? null, group, effective, item.id, formatId);
      if (appliedDate == null) {
        continue;
      }
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
