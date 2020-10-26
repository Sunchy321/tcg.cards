/* eslint-disable camelcase */
import { Document, Schema } from 'mongoose';

import conn from '../db';

import { RawCard, UUID } from '../../scryfall/interface';

export type ICard = {
    card_id: UUID;
    set_id: string;
} & Omit<RawCard, 'id' | 'set'>;

export const CardSchema = new Schema({
    // Core Card Fields
    arena_id:          Number,
    card_id:           String,
    lang:              String,
    mtgo_id:           Number,
    mtgo_foil_id:      Number,
    multiverse_ids:    [Number],
    tcgplayer_id:      Number,
    cardmarket_id:     Number,
    object:            String,
    oracle_id:         String,
    prints_search_uri: String,
    ruling_uri:        String,
    scryfall_uri:      String,
    uri:               String,

    // Gameplay Fields
    all_parts: [
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
    card_faces: [
        {
            _id:               false,
            artist:            String,
            color_indicator:   [String],
            colors:            [String],
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
    cmc:             Number,
    color_identity:  [String],
    color_indicator: [String],
    colors:          [String],
    edhrec_rank:     Number,
    foil:            Boolean,
    hand_modifier:   String,
    keywords:        [String],
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
    produced_mana:   [String],
    reserved:        Boolean,
    toughness:       String,
    type_line:       String,

    // Print Fields
    artist:            String,
    booster:           Boolean,
    border_color:      String,
    card_back_id:      String,
    collector_number:  String,
    content_warning:   Boolean,
    digital:           Boolean,
    flavor_name:       String,
    flavor_text:       String,
    frame_effects:     [String],
    frame:             String,
    full_art:          Boolean,
    games:             [String],
    highres_image:     Boolean,
    illustration_id:   String,
    image_uris:        {},
    prices:            {},
    printed_name:      String,
    printed_text:      String,
    printed_type_line: String,
    promo:             Boolean,
    promo_types:       [String],
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
});

const Card = conn.model<ICard & Document>('scryfall_card', CardSchema);

export default Card;
