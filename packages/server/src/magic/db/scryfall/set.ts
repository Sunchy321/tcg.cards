/* eslint-disable camelcase */
import { Document, Schema } from 'mongoose';

import conn from '../db';

import { UUID } from '@interface/magic/scryfall/basic';
import { RawSet } from '@interface/magic/scryfall/set';

export type ISet = { set_id: UUID } & Omit<RawSet, 'id'>;

const SetSchema = new Schema<ISet>({
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
    card_count:      Number,
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
