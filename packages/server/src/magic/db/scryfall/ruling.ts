/* eslint-disable camelcase */
import { Document, Schema } from 'mongoose';

import { RawRuling } from '@/magic/scryfall/interface';

import conn from '../db';

type IRuling = RawRuling

const RulingSchema = new Schema({
    oracle_id:    String,
    source:       String,
    published_at: String,
    comment:      String,
});

const Ruling = conn.model<IRuling & Document>('scryfall_ruling', RulingSchema);

export default Ruling;
