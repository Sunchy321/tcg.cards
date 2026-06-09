/** Tag slugs. */
export const TAG_SLUG = {
  PREMIUM: 'premium',
  HAS_DIAMOND: 'has-diamond',
  HAS_SIGNATURE: 'has-signature',
  HIDE_HEALTH: 'hide-health',
  HIDE_ATTACK: 'hide-attack',
  HIDE_COST: 'hide-cost',
  HIDE_WATERMARK: 'hide-watermark',
  TRADEABLE: 'tradeable',
  IN_MINI_SET: 'in-mini-set',
  FORGE: 'forge',
  TIMEWARPED: 'timewarped',
} as const;

/** GAME_TAG enum IDs. Keys match TAG_SLUG. */
export const TAG_ID = {
  PREMIUM: 12,
  HAS_DIAMOND: 1932,
  HAS_SIGNATURE: 2589,
  HIDE_HEALTH: 682,
  HIDE_ATTACK: 683,
  HIDE_COST: 684,
  HIDE_WATERMARK: 1107,
  TRADEABLE: 1720,
  IN_MINI_SET: 1824,
  FORGE: 2785,
  TIMEWARPED: 4503,
} as const;

/**
 * Render mechanic slugs, sorted by TAG_ID ascending.
 *
 * Spec: [hearthstone-image-renderer-protocol](../../../../../docs/hearthstone-image-renderer-protocol.md)
 */
export const RENDER_MECHANIC_SLUGS = [
  TAG_SLUG.HIDE_HEALTH,
  TAG_SLUG.HIDE_ATTACK,
  TAG_SLUG.HIDE_COST,
  TAG_SLUG.HIDE_WATERMARK,
  TAG_SLUG.TRADEABLE,
  TAG_SLUG.IN_MINI_SET,
  TAG_SLUG.FORGE,
  TAG_SLUG.TIMEWARPED,
] as const;
