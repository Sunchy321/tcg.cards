import z from 'zod';

import { createSearchNormalResult, createSearchResult } from '#search/schema';

import { cardEntityView } from './entity';
import { ambit } from '../../ambit';

export const cardImageVariant = z.enum(['normal', 'golden', 'diamond', 'signature', 'battlegrounds']);

/** Contains only the latest card fields required by search lists and images. */
export const essentialCardSearchItem = cardEntityView.pick({
  cardId:           true,
  lang:             true,
  renderHash:       true,
  ambit:            true,
  set:              true,
  classes:          true,
  type:             true,
  cost:             true,
  attack:           true,
  health:           true,
  durability:       true,
  armor:            true,
  rune:             true,
  race:             true,
  spellSchool:      true,
  collectible:      true,
  elite:            true,
  rarity:           true,
  legalities:       true,
  techLevel:        true,
  inBobsTavern:     true,
  raceBucket:       true,
  mercenaryRole:    true,
  mercenaryFaction: true,
  colddown:         true,
}).extend({
  simpleTags:   z.record(z.string(), z.union([z.boolean(), z.int()])),
  localization: z.strictObject({
    name:        z.string(),
    text:        z.string(),
    searchTerms: z.string().array().nullable(),
  }),
}).strict();

export const essentialNormalResult = createSearchNormalResult(essentialCardSearchItem).extend({
  variant: cardImageVariant.default('normal'),
  ambit,
});

export const essentialSearchResult = createSearchResult(essentialNormalResult);

/** Describes one essential search row without complete entity or revision data. */
export type EssentialCardSearchItem = z.infer<typeof essentialCardSearchItem>;

/** Describes the essential page and its aggregate metadata. */
export type EssentialNormalResult = z.infer<typeof essentialNormalResult>;

/** Carries an essential result or public query errors. */
export type EssentialSearchResult = z.infer<typeof essentialSearchResult>;

export const normalResult = createSearchNormalResult(cardEntityView).extend({
  variant: cardImageVariant.default('normal'),
  ambit,
});

export type NormalResult = z.infer<typeof normalResult>;

export const searchResult = createSearchResult(normalResult);

export type SearchResult = z.infer<typeof searchResult>;
