/**
 * Layouts whose parts are two printed images (front/back). The site renders
 * these as a flippable card and requests both `<number>.webp` and
 * `<number>⁑.webp`, so both faces are stored.
 *
 * `reversible_card` is deliberately absent: projection splits a reversible
 * object into one single-face print per face (collector numbers decorated
 * a/b, each pinned to its scryfall face), so each of its prints carries one
 * image under its own number — no `<number>⁑` file exists for the layout.
 *
 * The site's `turnable` list in apps/site-magic/app/components/CardImage.vue
 * still flips reversible prints, but across the sibling prints (collector
 * number a/b swapped) rather than through a second stored image, so the two
 * lists are not identical.
 */
export const twoImageLayouts = [
  'battle',
  'double_faced',
  'modal_dfc',
  'transform',
  'transform_token',
] as const;

/**
 * Whether one layout prints a second image. Every other layout — adventure,
 * split, flip, planar, prepare, aftermath, meld, mutate, leveler, class, case,
 * prototype, reversible_card, normal, saga, token … — prints a single image
 * per print row even when the card has several parts, so only one image is
 * stored; the site shows the other parts by rotating or turning that one
 * image, or (reversible_card) as separate prints.
 */
export function isTwoImageLayout(layout: string | null | undefined): boolean {
  return layout != null && (twoImageLayouts as readonly string[]).includes(layout);
}
