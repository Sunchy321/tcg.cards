/* eslint-disable camelcase */

export interface IStatus {
    method: 'get' | 'load' | 'merge',
    type: 'card' | 'ruling' | 'set' | 'image',

    amount: {
        updated?: number;
        count: number;
        total?: number;
    };

    time?: {
        elapsed: number;
        remaining: number;
    };
}

export type UUID = string;
export type URI = string;
export type Timestamp = string;
export type MimeType = string;
export type Encoding = string;

export type CardComponent = 'token'|'meld_part'|'meld_result'|'combo_piece';
export type Color = 'W'|'U'|'B'|'R'|'G';
export type Game = 'paper'|'arena'|'mtgo';
export type Legality = 'legal'|'not_legal'|'restricted'|'banned';

export type Colors = Color[];
export type Legalities = Record<string, Legality>;

export interface List<T> {
    object: 'list';
    total_cards?: number;
    has_more: boolean;
    next_page?: URI;
    data: T[];
    warning?: string[];
}

export interface Part {
    id: string,
    object: 'related_card',
    component: CardComponent,
    name: string,
    type_line: string,
    uri: URI,
}

export interface CardFace {
    artist?: string,
    artist_id?: string,
    color_indicator?: Colors,
    colors?: Colors,
    flavor_text?: string,
    illustration_id?: UUID,
    image_uris?: Record<string, URI>,
    loyalty?: string,
    mana_cost: string,
    name: string,
    object: 'card_face',
    oracle_text?: string,
    power?: string,
    printed_name?: string,
    printed_text?: string,
    printed_type_line?: string,
    toughness?: string,
    type_line: string,
    watermark?: string,
}

export interface RawCard {
    // Core Card Fields
    arena_id?: number,
    id: UUID,
    lang: string,
    mtgo_id?: number,
    mtgo_foil_id?: number,
    multiverse_ids: number[],
    tcgplayer_id?: number,
    cardmarket_id?: number,
    object: 'card',
    oracle_id: UUID,
    prints_search_uri: URI,
    ruling_uri: URI,
    scryfall_uri: URI,
    uri: URI,

    // Gameplay Fields
    all_parts?: Part[],
    card_faces?: CardFace[],
    cmc: number,
    color_identity: Colors,
    color_indicator?: Colors,
    colors?: Colors,
    edhrec_rank?: number,
    foil: boolean,
    hand_modifier?: string,
    keywords: string[],
    layout: string,
    legalities: Legalities,
    life_modifier?: string,
    loyalty?: string,
    mana_cost?: string,
    name: string,
    nonfoil: boolean,
    oracle_text?: string,
    oversized: boolean,
    power?: string,
    produced_mana?: Colors,
    reserved: boolean,
    toughness?: string,
    type_line: string,

    // Print Fields
    artist?: string,
    artist_ids?: string[],
    booster: boolean,
    border_color: string,
    card_back_id: UUID,
    collector_number: string,
    content_warning?: boolean,
    digital: boolean,
    flavor_name?: string,
    flavor_text?: string,
    frame_effects: string[],
    frame: string,
    full_art: boolean,
    games: Game[],
    highres_image: boolean,
    illustration_id?: UUID,
    image_status: string;
    image_uris?: Record<string, URI>,
    prices: Record<string, string>,
    printed_name?: string,
    printed_text?: string,
    printed_type_line?: string,
    promo: boolean,
    promo_types?: string[],
    purchase_uris: Record<string, URI>,
    rarity: string,
    related_uris: Record<string, URI>,
    released_at: string,
    reprint: boolean,
    scryfall_set_uri: URI,
    set_name: string,
    set_search_uri: URI,
    set_type: string,
    set_uri: URI,
    set: string,
    set_id: string,
    story_spotlight: boolean,
    textless: boolean,
    variation: boolean,
    variation_of?: UUID,
    watermark?: string,

    preview?: {
        previewed_at: string,
        source_uri: URI,
        source: string,
    },
}

export interface RawRuling {
    oracle_id: string,
    source: string,
    published_at: string,
    comment: string,
}

export interface RawSet {
    id: UUID,
    code: string,
    mtgo_code?: string,
    tcgplayer_id?: number,
    name: string,
    set_type: string,
    released_at?: string,
    block_code?: string,
    block?: string,
    parent_set_code?: string,
    card_count: number,
    printed_size?: number,
    digital: boolean,
    foil_only: boolean,
    nonfoil_only: boolean,
    scryfall_uri: URI,
    uri: URI,
    icon_svg_uri: URI,
    search_uri: URI,
}
