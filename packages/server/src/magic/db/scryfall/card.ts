/* eslint-disable camelcase */
import { Document, Schema } from 'mongoose';

import conn from '../db';

import { RawCard, UUID } from '../../scryfall/interface';
import { Diff } from 'deep-diff';

export type ICardBase = {
    card_id: UUID;
    set_id: string;
} & Omit<RawCard, 'object' | 'id' | 'set'>;

export type ICard = ICardBase & {
    __file: string;
    __diff?: Diff<ICardBase, ICardBase>[];
};

const CardSchema = new Schema({
    // Core Card Fields
    arena_id:          Number,
    card_id:           String,
    lang:              String,
    mtgo_id:           Number,
    mtgo_foil_id:      Number,
    multiverse_ids:    { type: [Number], default: undefined },
    tcgplayer_id:      Number,
    cardmarket_id:     Number,
    object:            String,
    oracle_id:         String,
    prints_search_uri: String,
    ruling_uri:        String,
    scryfall_uri:      String,
    uri:               String,

    // Gameplay Fields
    all_parts: {
        type: [
            {
                _id:       false,
                id:        String,
                object:    String,
                component: String,
                name:      String,
                type_line: String,
                uri:       String,
            },
        ],
        default: undefined,
    },

    card_faces: {
        type: [
            {
                _id:               false,
                artist:            String,
                artist_id:         String,
                color_indicator:   { type: [String], default: undefined },
                colors:            { type: [String], default: undefined },
                flavor_text:       String,
                illustration_id:   String,
                image_uris:        {},
                loyalty:           String,
                mana_cost:         String,
                name:              String,
                object:            String,
                oracle_text:       String,
                power:             String,
                printed_name:      String,
                printed_text:      String,
                printed_type_line: String,
                toughness:         String,
                type_line:         String,
                watermark:         String,
            },
        ],
        default: undefined,
    },

    cmc:             Number,
    color_identity:  { type: [String], default: undefined },
    color_indicator: { type: [String], default: undefined },
    colors:          { type: [String], default: undefined },
    edhrec_rank:     Number,
    foil:            Boolean,
    hand_modifier:   String,
    keywords:        { type: [String], default: undefined },
    layout:          String,
    legalities:      {},
    life_modifier:   String,
    loyalty:         String,
    mana_cost:       String,
    name:            String,
    nonfoil:         Boolean,
    oracle_text:     String,
    oversized:       Boolean,
    power:           String,
    produced_mana:   { type: [String], default: undefined },
    reserved:        Boolean,
    toughness:       String,
    type_line:       String,

    // Print Fields
    artist:            String,
    artist_ids:        { type: [String], default: undefined },
    booster:           Boolean,
    border_color:      String,
    card_back_id:      String,
    collector_number:  String,
    content_warning:   Boolean,
    digital:           Boolean,
    flavor_name:       String,
    flavor_text:       String,
    frame_effects:     { type: [String], default: undefined },
    frame:             String,
    full_art:          Boolean,
    games:             { type: [String], default: undefined },
    highres_image:     Boolean,
    illustration_id:   String,
    image_status:      String,
    image_uris:        {},
    prices:            {},
    printed_name:      String,
    printed_text:      String,
    printed_type_line: String,
    promo:             Boolean,
    promo_types:       { type: [String], default: undefined },
    purchase_uris:     {},
    rarity:            String,
    related_uris:      {},
    released_at:       String,
    reprint:           Boolean,
    scryfall_set_uri:  String,
    set_name:          String,
    set_search_uri:    String,
    set_type:          String,
    set_uri:           String,
    set_id:            String,
    story_spotlight:   Boolean,
    textless:          Boolean,
    variation:         Boolean,
    variation_of:      String,
    watermark:         String,

    preview: {
        previewed_at: String,
        source_uri:   String,
        source:       String,
    },

    file: String,
    diff: {},
}, { strict: false });

const Card = conn.model<ICard & Document>('scryfall_card', CardSchema);

export default Card;
