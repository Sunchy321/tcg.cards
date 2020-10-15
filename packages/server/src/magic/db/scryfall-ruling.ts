import { Schema } from 'mongoose';

import conn from '../db';

export const ScryfallRulingSchema = new Schema({
    oracle_id: String,
    source: String,
    published_at: String,
    comment: String,
});

const ScryfallRuling = conn.model('scryfall_ruling', ScryfallRulingSchema);

export default ScryfallRuling;
