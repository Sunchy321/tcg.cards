/* eslint-disable camelcase */
import { Document, Schema } from 'mongoose';

import conn from './db';

export interface IScryfallRulingData {
    oracle_id: string,
    source: string,
    published_at: string,
    comment: string,
}

const ScryfallRulingSchema = new Schema({
    oracle_id:    String,
    source:       String,
    published_at: String,
    comment:      String,
});

const ScryfallRuling = conn.model<IScryfallRulingData & Document>('scryfall_ruling', ScryfallRulingSchema);

export default ScryfallRuling;
