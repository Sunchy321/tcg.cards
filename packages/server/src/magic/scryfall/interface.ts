// tslint:disable: max-line-length

export type UUID = string;
export type URI = string;
export type SDate = string;

export interface ISList<T> {
    data: T[];
    has_more: boolean;
    next_page?: URI;
    total_cards?: number;
    warnings?: string[];
}

export type Colors = ['W' | 'U' | 'B' | 'R' | 'G'];

export type Layout = 'normal' | 'split' | 'flip' | 'transform' | 'meld' | 'leveler' | 'saga' | 'adventure' | 'planar' | 'scheme' | 'vanguard' | 'token' | 'double_faced_token' | 'emblem' | 'augment' | 'host' | 'art_series' | 'double_sided';
export type Legality = 'legal' | 'not_legal' | 'restricted' | 'banned';

export type BorderColor = 'black' | 'borderless' | 'gold' | 'silver' | 'white';
export type Frame = '1993' | '1997' | '2003' | '2015' | 'future';
export type FrameEffect = 'legendary' | 'miracle' | 'nyxtouched' | 'draft' | 'devoid' | 'tombstone' | 'colorshifted' | 'inverted' | 'sunmoondfc' | 'compasslanddfc' | 'originpwdfc' | 'mooneldrazidfc' | 'moonreversemoondfc' | 'showcase' | 'extendedart';

export type Game = 'paper' | 'arena' | 'mtgo';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic';

export type Component = 'token' | 'meld_part' | 'meld_result' | 'combo_piece';

export interface IScryfallCardFace {
    artist?: string;
    color_indicator?: Colors;
    colors?: Colors;
    flavor_text?: string;
    illustration_id?: UUID;
    image_uris: object;
    loyalty?: string;
    mana_cost: string;
    name: string;
    object: string;
    oracle_text?: string;
    power?: string;
    printed_name?: string;
    printed_text?: string;
    printed_type_line?: string;
    toughness?: string;
    type_line: string;
    watermark?: string;
}

export interface IScryfallCardRelated {
    id: UUID;
    object: string;
    component: Component;
    name: string;
    type_line: string;
    uri: URI;
}

export interface IScryfallCard {
    // Core Card Fields
    arena_id?: number;
    id: UUID;
    lang: string;
    mtgo_id?: number;
    mtgo_foil_id?: number;
    multiverse_ids?: [number];
    tcgplayer_id?: number;
    object: string;
    oracle_id: UUID;
    prints_search_uri: URI;
    ruling_uri: URI;
    scryfall_uri: URI;
    uri: URI;

    // Gameplay Fields
    all_parts?: [IScryfallCardRelated];
    card_faces?: [IScryfallCardFace];
    cmc: number;
    colors?: Colors;
    color_identity: Colors;
    color_indicator: Colors;
    edhrec_rank?: number;
    foil: boolean;
    hand_modifier?: string;
    layout: Layout;
    legalities: { [k in string]: Legality };
    life_modifier?: string;
    loyalty?: string;
    mana_cost?: string;
    name: string;
    nonfoil: boolean;
    oracle_text?: string;
    oversized: boolean;
    power?: string;
    reserved: boolean;
    toughness?: string;
    type_line: string;

    // Print Fields
    artist?: string;
    booster: boolean;
    border_color: BorderColor;
    card_back_id: UUID;
    collector_number: string;
    digital: boolean;
    flavor_text?: string;
    frame_effects: [FrameEffect];
    frame: Frame;
    full_art: boolean;
    games: [Game];
    highres_image: boolean;
    illustration_od?: UUID;
    image_uris: object;
    prices: object;
    printed_name?: string;
    printed_text?: string;
    printed_type_line?: string;
    promo: boolean;
    promo_types: [string];
    purchase_uris: object;
    rarity: Rarity;
    related_uris: object;
    released_at: SDate;
    reprint: boolean;
    scryfall_set_uri: URI;
    set_name: string;
    set_search_uri: URI;
    set_type: string;
    set_uri: URI;
    set: string;
    story_spotlight: boolean;
    textless: boolean;
    variation: boolean;
    variation_of?: UUID;
    watermark?: string;

    preview?: {
        previewed_at?: SDate;
        source_uri?: URI;
        source?: string;
    };
}

export type ScryfallSetType =
    'core' | 'expansion' | 'masters' | 'masterpiece' | 'from_the_vault' | 'spellbook' | 'premium_deck' | 'duel_deck' | 'draft_innovation' | 'treasure_chest' | 'commander' | 'planechase' | 'archenemy' | 'vanguard' | 'funny' | 'starter' | 'box' | 'promo' | 'token' | 'memorabilia';

export interface IScryfallSet {
    id: UUID;
    code: string;
    mtgo_code?: string;
    tcgplayer_id?: number;
    name: string;
    set_type: ScryfallSetType;
    released_at?: SDate;
    block_code?: string;
    block?: string;
    parent_set_code: string;
    card_count: number;
    digital: boolean;
    foil_only: boolean;
    scryfall_uri: URI;
    uri: URI;
    icon_svg_uri: URI;
    search_uti: URI;
}
