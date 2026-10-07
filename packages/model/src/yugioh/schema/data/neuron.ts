import { z } from 'zod';

/**
 * One print entry from a Neuron detail page's print list (`update_list`):
 * regional card number, pack, official rarity wording, and release date.
 * `cardNo` and rarity fields are null when the entry does not carry them
 * (some promo entries print no card number).
 */
export const neuronPrintEntry = z.looseObject({
  releaseDate: z.string(),
  cardNo:      z.string().nullable(),
  packName:    z.string(),
  packId:      z.string().nullable(),
  rarityCode:  z.string().nullable(),
  rarityName:  z.string().nullable(),
});

/**
 * The parsed main-card data of one Neuron detail page for one locale. Stats
 * are strings on purpose: the site prints "?" for unknown ATK/DEF and levels
 * arrive as part of a label ("レベル 8"). Spec items the parser does not
 * recognize are kept verbatim in `specItems` so nothing is silently dropped.
 */
export const neuronCardData = z.looseObject({
  cid:           z.int(),
  locale:        z.string(),
  name:          z.string(),
  /** Rename provenance split off the displayed name ("Updated from: Big Core"). */
  nameAnnotation: z.string().nullable().optional(),
  ruby:          z.string().nullable().optional(),
  enName:        z.string().nullable().optional(),
  attribute:     z.string().nullable().optional(),
  level:         z.int().nullable().optional(),
  rank:          z.int().nullable().optional(),
  linkRating:    z.int().nullable().optional(),
  /** Konami's link-marker encoding ("813"), read from the arrow icon class. */
  linkMarker:    z.string().nullable().optional(),
  pendulumScale: z.int().nullable().optional(),
  atk:           z.string().nullable().optional(),
  def:           z.string().nullable().optional(),
  species:       z.string().nullable().optional(),
  typeText:      z.string().nullable().optional(),
  text:          z.string().nullable().optional(),
  pendulumText:  z.string().nullable().optional(),
  /** Rename/errata notice from the page's Note box, when present. */
  note:          z.string().nullable().optional(),
  specItems:     z.looseObject({ title: z.string(), value: z.string() }).array(),
  imageIds:      z.int().array(),
  prints:        neuronPrintEntry.array(),
});

export type NeuronPrintEntry = z.infer<typeof neuronPrintEntry>;
export type NeuronCardData = z.infer<typeof neuronCardData>;
