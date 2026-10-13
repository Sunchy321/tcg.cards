import type { Group } from '@tcg-cards/model/hearthstone/schema/announcement';

/**
 * Mechanic tag ids for rule-based groups, keyed by the mechanic name used in
 * the reference data (old project's tag/map/mechanic.yml).
 */
export const mechanicId = {
  ritual:     '424',
  newRitual:  '3078',
  invoke:     '1263',
  quest:      '462',
  sidequest:  '1192',
  questline:  '1725',
  filterOdd:  '957',
  filterEven: '956',
} as const;

export type GroupRule = {
  /** Card matches when it carries any of these mechanic tags. */
  mechanics?:   readonly string[];
  /** Card type predicate. */
  type?:        string;
  /** Requires the collectible flag. */
  collectible?: boolean;
  /** Minimum cost, inclusive. */
  minCost?:     number;
  /** Card ids always excluded from the group. */
  exclude?:     readonly string[];
};

/**
 * Rule-based groups. A group's cards are computed from its rule against the
 * card dataset instead of a manually maintained card list. Groups without an
 * entry (core_rotation, bg_*) are not computable and stay label-only.
 */
export const groupRules: Partial<Record<Group, GroupRule>> = {
  quest:    { mechanics: [mechanicId.quest, mechanicId.sidequest, mechanicId.questline] },
  c_thun:   { mechanics: [mechanicId.ritual, mechanicId.newRitual] },
  invoke:   { mechanics: [mechanicId.invoke] },
  odd_even: { mechanics: [mechanicId.filterOdd, mechanicId.filterEven] },
  hero:     { type: 'hero', collectible: true, minCost: 1, exclude: ['EX1_323', 'CORE_EX1_323'] },
};

/** Returns the rule for a group, or undefined when the group is not rule-based. */
export function getGroupRule(group: Group): GroupRule | undefined {
  return groupRules[group];
}
