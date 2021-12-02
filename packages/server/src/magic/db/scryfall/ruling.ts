/* eslint-disable camelcase */
import { Document, Schema } from 'mongoose';

import { RawRuling } from '@interface/magic/scryfall/card';

import conn from '../db';

export type IRuling = RawRuling & {
    file: string;
};

const RulingSchema = new Schema<IRuling>({
    oracle_id:    String,
    source:       String,
    published_at: String,
    comment:      String,

    file: String,
});

const Ruling = conn.model<Document & IRuling>('scryfall_ruling', RulingSchema);

export default Ruling;
