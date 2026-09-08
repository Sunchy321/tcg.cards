import { z } from 'zod';

/** Languages selectable for card data via the official API `Lang` header. */
export const shadowverseLangs = ['ja', 'en', 'chs', 'cht', 'ko'] as const;

export type ShadowverseLang = (typeof shadowverseLangs)[number];

/** Site language → uploads resource directory mapping confirmed from the official frontend bundle. */
export const shadowverseResourceLangs = {
  ja:  'jpn',
  en:  'eng',
  cht: 'cht',
  chs: 'chs',
  ko:  'kor',
} as const satisfies Record<ShadowverseLang, string>;

/** 32-char lowercase hex asset hash used by official image URLs. */
const assetHash = z.string().regex(/^[a-f0-9]{32}$/);

/** Optional asset hash; the official API sends an empty string instead of null when absent. */
const nullableAssetHash = z.preprocess(
  value => (value === '' ? null : value),
  assetHash.nullable(),
);

/** Relation map entry for one card, verbatim from the source `cards` map. */
export const cardRelations = z.looseObject({
  related_card_ids: z.array(z.number()).default([]),
  specific_effect_card_ids: z.array(z.number()).default([]),
});

export type CardRelations = z.infer<typeof cardRelations>;

/** Language-independent plus localized common card fields as served by the official API. */
export const cardCommon = z.looseObject({
  card_id: z.number(),
  name: z.string(),
  name_ruby: z.string().nullable(),
  base_card_id: z.number(),
  card_resource_id: z.number(),
  atk: z.number().nullable(),
  life: z.number().nullable(),
  flavour_text: z.string().nullable(),
  skill_text: z.string().nullable(),
  card_set_id: z.number(),
  type: z.number(),
  class: z.number(),
  tribes: z.array(z.number()),
  cost: z.number().nullable(),
  rarity: z.number(),
  cv: z.string().nullable(),
  illustrator: z.string().nullable(),
  questions: z.array(z.record(z.string(), z.unknown())).nullable(),
  is_token: z.boolean(),
  is_include_rotation: z.boolean().nullable(),
  deck_enabled_num: z.number().nullable(),
  card_image_hash: assetHash,
  card_banner_image_hash: nullableAssetHash,
  original_card_id: z.number().nullable(),
  is_starter_ability_changed: z.boolean().nullable(),
});

export type CardCommon = z.infer<typeof cardCommon>;

/** Evolution-state fields for one card; served per language. */
export const cardEvo = z.looseObject({
  card_resource_id: z.number(),
  flavour_text: z.string().nullable(),
  skill_text: z.string().nullable(),
  card_image_hash: assetHash,
  card_banner_image_hash: nullableAssetHash,
});

export type CardEvo = z.infer<typeof cardEvo>;

/** One alternate card art entry; served per language with language-specific hashes. */
export const cardStyle = z.looseObject({
  hash: assetHash,
  evo_hash: nullableAssetHash,
  name: z.string().nullable(),
  name_ruby: z.string().nullable(),
  cv: z.string().nullable(),
  illustrator: z.string().nullable(),
  skill_text: z.string().nullable(),
  flavour_text: z.string().nullable(),
  evo_flavour_text: z.string().nullable(),
});

export type CardStyle = z.infer<typeof cardStyle>;

/** One card detail; `evo` is an object when present and an empty array when absent. */
export const cardDetail = z.looseObject({
  common: cardCommon,
  evo: z.union([cardEvo, z.array(z.unknown())]).nullable(),
  style_card_list: z.array(cardStyle),
});

export type CardDetail = z.infer<typeof cardDetail>;

/**
 * Card-keyed map from the official API. The server serializes empty results as
 * arrays (e.g. soft rate-limit responses), so both shapes are accepted and an
 * array is normalized to an empty map; non-empty results are always objects.
 */
const cardKeyed = <T extends z.ZodType>(valueSchema: T) =>
  z.union([
    z.record(z.string(), valueSchema),
    z.array(z.unknown()).transform(() => ({}) as Record<string, z.output<T>>),
  ]);

/** Full `/web/CardList/cardList` response for one page of one language. */
export const cardListResponse = z.looseObject({
  data_headers: z.looseObject({
    result_code: z.number(),
  }),
  data: z.looseObject({
    cards: cardKeyed(cardRelations),
    card_details: cardKeyed(cardDetail),
    count: z.number(),
    card_set_names: z.record(z.string(), z.string()),
    tribe_names: z.record(z.string(), z.string()).optional(),
    skill_names: z.record(z.string(), z.string()).optional(),
    skill_replace_text_names: z.record(z.string(), z.string()).optional(),
    sort_card_id_list: z.array(z.number()).optional(),
    stats_list: z.unknown().optional(),
    result_error_code: z.string().nullable().optional(),
  }),
});

export type CardListResponse = z.infer<typeof cardListResponse>;
