import z from 'zod';

export const legality = z.enum([
    'not_legal',
    'legal',
    'banned',
    'restricted',
]);

export const rarity = z.enum([
    'common',
    'uncommon',
    'rare',
    'mythic',
    'special',
    'bonus',
]);

export const game = z.enum([
    'paper',
    'mtgo',
    'arena',
]);

export const finish = z.enum([
    'nonfoil',
    'foil',
    'etched',
    'glossy',
]);

export const layout = z.enum([
    'normal',
    'split',
    'flip',
    'transform',
    'modal_dfc',
    'meld',
    'leveler',
    'class',
    'saga',
    'adventure',
    'mutate',
    'prototype',
    'battle',
    'planar',
    'scheme',
    'vanguard',
    'token',
    'double_faced_token',
    'emblem',
    'augment',
    'host',
    'art_series',
    'reversible_card',
]);

export const borderColor = z.enum([
    'black',
    'white',
    'borderless',
    'silver',
    'gold',
]);

export const frame = z.enum([
    '1993',
    '1997',
    '2003',
    '2015',
    'future',
]);

export const imageStatus = z.enum([
    'missing',
    'placeholder',
    'lowres',
    'highres_scan',
]);

export const language = z.enum([
    'Chinese Simplified',
    'Chinese Traditional',
    'English',
    'Japanese',
    'Korean',
    'French',
    'German',
    'Spanish',
    'Italian',
    'Portuguese',
    'Russian',
]);

export const imageUris = z.strictObject({
    png:         z.url(),
    large:       z.url(),
    small:       z.url(),
    normal:      z.url(),
    art_crop:    z.url(),
    border_crop: z.url(),
});

export const zhsImageUris = z.strictObject({
    small:  z.url(),
    normal: z.url(),
    large:  z.url(),
});

export const prices = z.strictObject({
    usd:        z.string().nullable(),
    usd_foil:   z.string().nullable(),
    usd_etched: z.string().nullable(),
    eur:        z.string().nullable(),
    eur_foil:   z.string().nullable(),
    tix:        z.string().nullable(),
});

export const purchaseUris = z.strictObject({
    tcgplayer:   z.url().optional(),
    cardmarket:  z.url().optional(),
    cardhoarder: z.url().optional(),
});

export const relatedUris = z.strictObject({
    edhrec:                      z.url().optional(),
    gatherer:                    z.url().optional(),
    tcgplayer_infinite_decks:    z.url().optional(),
    tcgplayer_infinite_articles: z.url().optional(),
});

export const legalities = z.record(z.string(), legality);

export const mtgchCard = z.strictObject({
    id:                            z.uuid(),
    face_index:                    z.number().int(),
    lang:                          z.string(),
    arena_id:                      z.number().int().nullable(),
    mtgo_id:                       z.number().int().nullable(),
    mtgo_foil_id:                  z.number().int().nullable(),
    multiverse_id:                 z.number().int().nullable(),
    tcgplayer_id:                  z.number().int().nullable(),
    tcgplayer_etched_id:           z.number().int().nullable(),
    cardmarket_id:                 z.number().int().nullable(),
    object:                        z.literal('card'),
    layout,
    oracle_id:                     z.uuid(),
    prints_search_uri:             z.url(),
    rulings_uri:                   z.url(),
    scryfall_uri:                  z.url(),
    uri:                           z.url(),
    all_parts:                     z.any().nullable(),
    cmc:                           z.number(),
    color_identity:                z.string().array(),
    color_indicator:               z.string().array().nullable(),
    colors:                        z.string().array().nullable(),
    defense:                       z.string().nullable(),
    edhrec_rank:                   z.number().int().nullable(),
    game_changer:                  z.boolean(),
    hand_modifier:                 z.string().nullable(),
    keywords:                      z.string().array(),
    legalities,
    life_modifier:                 z.string().nullable(),
    loyalty:                       z.string().nullable(),
    mana_cost:                     z.string(),
    name:                          z.string(),
    face_name:                     z.string().nullable(),
    oracle_text:                   z.string().nullable(),
    penny_rank:                    z.number().int().nullable(),
    power:                         z.string().nullable(),
    produced_mana:                 z.string().array().nullable(),
    reserved:                      z.boolean(),
    toughness:                     z.string().nullable(),
    type_line:                     z.string(),
    artist:                        z.string(),
    artist_ids:                    z.uuid().array(),
    attraction_lights:             z.number().int().array().nullable(),
    booster:                       z.boolean(),
    border_color:                  borderColor,
    card_back_id:                  z.uuid(),
    collector_number:              z.string(),
    content_warning:               z.boolean().nullable(),
    digital:                       z.boolean(),
    finishes:                      finish.array(),
    flavor_name:                   z.string().nullable(),
    flavor_text:                   z.string().nullable(),
    frame_effects:                 z.string().array().nullable(),
    frame,
    full_art:                      z.boolean(),
    games:                         game.array(),
    highres_image:                 z.boolean(),
    illustration_id:               z.uuid().nullable(),
    image_status:                  imageStatus,
    image_uris:                    imageUris,
    oversized:                     z.boolean(),
    prices,
    printed_name:                  z.string().nullable(),
    printed_text:                  z.string().nullable(),
    printed_type_line:             z.string().nullable(),
    promo:                         z.boolean(),
    promo_types:                   z.string().array().nullable(),
    purchase_uris:                 purchaseUris.nullable(),
    rarity,
    related_uris:                  relatedUris,
    released_at:                   z.string(),
    reprint:                       z.boolean(),
    scryfall_set_uri:              z.url(),
    set_name:                      z.string(),
    set_search_uri:                z.url(),
    set_type:                      z.string(),
    set_uri:                       z.url(),
    set:                           z.string(),
    set_id:                        z.uuid(),
    story_spotlight:               z.boolean(),
    textless:                      z.boolean(),
    variation:                     z.boolean(),
    variation_of:                  z.uuid().nullable(),
    security_stamp:                z.string().nullable(),
    watermark:                     z.string().nullable(),
    preview_previewed_at:          z.string().nullable(),
    preview_source_uri:            z.url().nullable(),
    preview_source:                z.string().nullable(),
    zhs_multiverse_id:             z.number().int().nullable(),
    zhs_name:                      z.string().nullable(),
    zhs_face_name:                 z.string().nullable(),
    zhs_flavor_name:               z.string().nullable(),
    zhs_type_line:                 z.string().nullable(),
    zhs_text:                      z.string().nullable(),
    zhs_flavor_text:               z.string().nullable(),
    zhs_language:                  language.nullable(),
    zhs_image:                     z.string().nullable(),
    zhs_extra:                     z.any().nullable(),
    atomic_official_name:          z.string().nullable(),
    full_official_name:            z.string().nullable(),
    atomic_translated_name:        z.string().nullable(),
    full_translated_name:          z.string().nullable(),
    atomic_name_translated_from:   z.string().nullable(),
    atomic_translated_type:        z.string().nullable(),
    atomic_translated_text:        z.string().nullable(),
    atomic_text_translated_from:   z.string().nullable(),
    atomic_translated_flavor_name: z.string().nullable(),
    atomic_translated_flavor_text: z.string().nullable(),
    atomic_flavor_translated_from: z.string().nullable(),
    int_collector_number:          z.number().int(),
    zhs_image_uris:                zhsImageUris.nullable(),
    set_translated_name:           z.string(),
    keyrune_code:                  z.string(),
    is_extras:                     z.any().nullable(),
    is_default:                    z.any().nullable(),
    extra_fields:                  z.any().nullable(),
    rulings:                       z.any().nullable(),
    pinyin:                        z.string(),
    pinyin_first_letter:           z.string(),
    other_faces:                   z.array(z.any()),
    is_preview:                    z.boolean(),
});

export type Legality = z.infer<typeof legality>;
export type Rarity = z.infer<typeof rarity>;
export type Game = z.infer<typeof game>;
export type Finish = z.infer<typeof finish>;
export type Layout = z.infer<typeof layout>;
export type BorderColor = z.infer<typeof borderColor>;
export type Frame = z.infer<typeof frame>;
export type ImageStatus = z.infer<typeof imageStatus>;
export type Language = z.infer<typeof language>;
export type ImageUris = z.infer<typeof imageUris>;
export type ZhsImageUris = z.infer<typeof zhsImageUris>;
export type Prices = z.infer<typeof prices>;
export type PurchaseUris = z.infer<typeof purchaseUris>;
export type RelatedUris = z.infer<typeof relatedUris>;
export type Legalities = z.infer<typeof legalities>;
export type MtgchCard = z.infer<typeof mtgchCard>;
