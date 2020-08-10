import { Schema } from 'mongoose';

export const RawRulingSchema = new Schema({
    oracle_id: String,
    source: String,
    published_at: String,
    comment: String
});
