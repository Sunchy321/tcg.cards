import z from 'zod';

import { defineChangeStatusByType } from '../../game-change';

export const announcementSource = z.enum([
  'wotc',
  'mtgcommander',
  'canadian_highlander',
  'duelcommander',
  'leviathan_commander',
  'oathbreaker',
  'pauper_commander',
  'initial',
  'release',
  'rotation',
]);

export const gameChangeType = z.enum([
  'card_change',
  'card_update',
  'set_change',
  'rule_change',
  'format_birth',
  'format_death',
  'card_split',
  'card_merge',
]);

export const legality = z.enum([
  'banned_as_commander',
  'banned_as_companion',
  'banned_in_bo1',
  'banned',
  'game_changer',
  'legal',
  'restricted',
  'suspended',
  'unavailable',
  'score',
]).describe('legality');

export const changeStatus = z.enum([
  // card_update
  'buff',
  'nerf',
  'tweak',
  'revert',
  'rework',
  'text_fix',
  'text_adjust',
  'bugged',
  'bugfix',
  // card_change / set_change / rule_change (legality)
  'banned_as_commander',
  'banned_as_companion',
  'banned_in_bo1',
  'banned',
  'game_changer',
  'legal',
  'restricted',
  'suspended',
  'unavailable',
  'score',
  // set_change 专用
  'extend',
]);

export type GameChangeType = z.infer<typeof gameChangeType>;
export type Legality = z.infer<typeof legality>;
export type ChangeStatus = z.infer<typeof changeStatus>;
export type Legalities = Record<string, Legality>;

/** Allowed statuses and the fallback status per change type (see game-change). */
export const changeStatusByType = defineChangeStatusByType(gameChangeType.options, {
  card_update: {
    statuses: ['buff', 'nerf', 'tweak', 'revert', 'rework', 'text_fix', 'text_adjust', 'bugged', 'bugfix'],
    default:  'buff',
  },
  card_change: {
    statuses: [...legality.options],
    default:  'banned',
  },
  set_change: {
    statuses: [...legality.options, 'extend'],
    default:  'legal',
  },
  rule_change:  { statuses: [], default: null },
  format_birth: { statuses: [], default: null },
  format_death: { statuses: [], default: null },
  card_split:   { statuses: [], default: null },
  card_merge:   { statuses: [], default: null },
});

export const linkEntry = z.strictObject({
  url:   z.string().url(),
  label: z.string().optional(),
});

export const glowEntry = z.strictObject({
  part: z.string(),
  type: z.enum(['buff', 'nerf']),
});

/** One projected card of an announcement item: its identity, the status applied to it, and when that takes hold. */
export const projectionCard = z.strictObject({
  cardId:        z.string(),
  status:        z.string().nullable(),
  effectiveDate: z.string().nullable(),
});

export const announcementItem = z.strictObject({
  id: z.uuid(),

  type:           gameChangeType,
  announcementId: z.uuid(),
  order:          z.number().int(),

  effectiveDate: z.string().nullable(),
  format:        z.string().nullable(),
  status:        changeStatus.nullable(),
  score:         z.int().min(1).nullish(),
  group:         z.string().nullable(),

  prevVersion: z.string().nullable(),

  delta: z.any().nullable(),
  glow:  glowEntry.array().nullable(),

  cardId:       z.string().nullable(),
  setId:        z.string().nullable(),
  ruleId:       z.string().nullable(),
  relatedCards: z.string().array(),

  projection: z.object({
    formats: z.array(z.string()),
    cards:   z.array(projectionCard),
    // Rotation removals are scoped because reprint availability differs by format.
    derivedCards: z.array(projectionCard.extend({
      formatId: z.string(),
      group:    z.string().nullable(),
    })).optional(),
  }).catchall(z.unknown()),

  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const announcement = z.strictObject({
  id: z.uuid(),

  source: z.string(),
  date:   z.string(),
  name:   z.string(),

  effectiveDate:         z.string().nullable(),
  effectiveDateTabletop: z.string().nullable(),
  effectiveDateOnline:   z.string().nullable(),
  effectiveDateArena:    z.string().nullable(),

  prevVersion: z.string().nullable(),

  nextDate: z.string().nullable(),

  link: linkEntry.array(),

  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const announcementProfile = announcement.pick({
  source: true,
  date:   true,
  name:   true,
}).extend({
  id: z.uuid(),
});

export const announcementWithItems = announcement.extend({
  items: announcementItem.array(),
});

export type LinkEntry = z.infer<typeof linkEntry>;
export type GlowEntry = z.infer<typeof glowEntry>;
export type AnnouncementSource = z.infer<typeof announcementSource>;
export type AnnouncementItem = z.infer<typeof announcementItem>;
export type Announcement = z.infer<typeof announcement>;
export type AnnouncementProfile = z.infer<typeof announcementProfile>;
export type AnnouncementWithItems = z.infer<typeof announcementWithItems>;
