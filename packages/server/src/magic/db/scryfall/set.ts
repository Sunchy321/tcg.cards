/* eslint-disable camelcase */
import { Document, Schema } from 'mongoose';

import conn from '../db';

import { RawSet, UUID } from '../../scryfall/interface';

export type ISet = { set_id: UUID } & Omit<RawSet, 'id'>;

const SetSchema = new Schema({
    set_id:          String,
    code:            String,
    mtgo_code:       String,
    tcgplayer_id:    Number,
    name:            String,
    set_type:        String,
    released_at:     String,
    block_code:      String,
    block:           String,
    parent_set_code: String,
    printed_size:    Number,
    digital:         Boolean,
    foil_only:       Boolean,
    nonfoil_only:    Boolean,
    scryfall_uri:    String,
    uri:             String,
    icon_svg_uri:    String,
    search_uri:      String,
});

const Set = conn.model<ISet & Document>('scryfall_set', SetSchema);

export default Set;
