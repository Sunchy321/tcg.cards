/* eslint-disable camelcase */
import { Document, Schema } from 'mongoose';

import { RawRuling } from '@/magic/scryfall/interface';

import conn from '../db';

export type IRuling = RawRuling & {
    file: string;
}

const RulingSchema = new Schema({
    oracle_id:    String,
    source:       String,
    published_at: String,
    comment:      String,

    file: String,
});

const Ruling = conn.model<IRuling & Document>('scryfall_ruling', RulingSchema);

export default Ruling;
