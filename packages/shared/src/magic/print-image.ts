/**
 * Layouts whose parts are two printed images (front/back). The site renders
 * these as a flippable card and requests both `<number>.webp` and
 * `<number>⁑.webp`, so both faces are stored.
 *
 * Must stay in sync with the `turnable` list in
 * apps/site-magic/app/components/CardImage.vue.
 */
export const twoImageLayouts = [
  'battle',
  'double_faced',
  'modal_dfc',
  'reversible_card',
  'transform',
  'transform_token',
] as const;

/**
 * Whether one layout prints a second image. Every other layout — adventure,
 * split, flip, planar, prepare, aftermath, meld, mutate, leveler, class, case,
 * prototype, normal, saga, token … — prints a single image even when the card
 * has several parts, so only the front face is stored; the site shows the
 * second part by rotating or turning that one image.
 */
export function isTwoImageLayout(layout: string | null | undefined): boolean {
  return layout != null && (twoImageLayouts as readonly string[]).includes(layout);
}
