import z from 'zod';

export const gameChangeType = z.enum([
  'card_change',
  'card_update',
  'set_change',
  'rule_change',
  'format_birth',
  'format_death',
]);

export const legality = z.enum([
  'banned_in_card_pool',
  'banned_in_deck',
  'banned',
  'legal',
  'minor',
  'unavailable',
  'score',
]).describe('legality');

export const changeStatus = z.enum([
  // placeholder: overridden by glow computation
  'unknown',
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
  'banned_in_card_pool',
  'banned_in_deck',
  'banned',
  'legal',
  'minor',
  'unavailable',
  'score',
  // set_change 专用
  'extend',
]);

export type GameChangeType = z.infer<typeof gameChangeType>;
export type Legality = z.infer<typeof legality>;
export type ChangeStatus = z.infer<typeof changeStatus>;
export type Legalities = Record<string, Legality>;

/**
 * Allowed statuses and the fallback status per change type. The editor dropdown,
 * type-change normalization, and YAML validation all share this single source.
 * Types without an entry have no status (null means "empty").
 */
export const changeStatusByType: Record<GameChangeType, { statuses: ChangeStatus[], default: ChangeStatus | null }> = {
  card_update: {
    statuses: ['unknown', 'buff', 'nerf', 'tweak', 'revert', 'rework', 'text_fix', 'text_adjust', 'bugged', 'bugfix'],
    default:  'buff',
  },
  card_change: {
    statuses: ['unknown', ...legality.options],
    default:  'banned',
  },
  set_change: {
    statuses: [...legality.options, 'extend'],
    default:  'legal',
  },
  rule_change:  { statuses: [], default: null },
  format_birth: { statuses: [], default: null },
  format_death: { statuses: [], default: null },
};

export const linkEntry = z.strictObject({
  url:   z.url(),
  label: z.string().optional(),
});

export const glowType = z.enum(['buff', 'nerf', 'rework', 'neutral']);
export const glowPart = z.enum([
  'cost',
  'tech-level',
  'trinket-size',
  'rune',
  'art',
  'name',
  'rarity',
  'text',
  'race',
  'spell-school',
  'attack',
  'health',
  'durability',
  'armor',
]);

export const glowEntry = z.strictObject({
  part: glowPart,
  type: glowType,
});

export const group = z.enum([
  'core_rotation',
  'bg_hero',
  'bg_minion',
  'bg_trinket',
  'bg_tavern_spell',
  'bg_anomaly',
  'bg_buddy',
  'bg_timewarped',
  'bg_dm_prize',
  'quest',
  'c_thun',
  'hero',
  'invoke',
  'odd_even',
]);

export const announcementItem = z.strictObject({
  id: z.uuid(),

  type:           gameChangeType,
  announcementId: z.uuid(),
  order:          z.number().int(),

  effectiveDate: z.string().nullable(),
  format:        z.string().nullable(),
  status:        changeStatus.nullable(),
  score:         z.int().min(1).nullish(),
  group:         group.nullable(),

  version:     z.number().int().nullable(),
  lastVersion: z.number().int().nullable(),

  delta: z.any().nullable(),
  glow:  glowEntry.array().nullable(),

  cardId:       z.string().nullable(),
  setId:        z.string().nullable(),
  ruleId:       z.string().nullable(),
  relatedCards: z.string().array(),

  projection: z.object({
    formats: z.array(z.string()),
    cards:   z.array(z.string()),
  }).catchall(z.unknown()),

  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const announcement = z.strictObject({
  id: z.uuid(),

  source: z.string(),
  date:   z.string(),
  name:   z.string(),

  version:     z.number().int(),
  lastVersion: z.number().int().nullable(),

  effectiveDate: z.string().nullable(),

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
export type GlowType = z.infer<typeof glowType>;
export type GlowPart = z.infer<typeof glowPart>;
export type GlowEntry = z.infer<typeof glowEntry>;
export type Group = z.infer<typeof group>;
export type AnnouncementItem = z.infer<typeof announcementItem>;
export type Announcement = z.infer<typeof announcement>;
export type AnnouncementProfile = z.infer<typeof announcementProfile>;
export type AnnouncementWithItems = z.infer<typeof announcementWithItems>;
