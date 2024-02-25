import { Schema } from 'mongoose';

import conn from './db';

import { Ruling as IRuling } from '@interface/magic/ruling';

const RulingSchema = new Schema<IRuling>({
    cardId: String,
    source: String,
    date:   String,
    text:   String,

    cards: [{
        _id:    false,
        text:   String,
        cardId: String,
        part:   Number,
    }],
});

const Ruling = conn.model('ruling', RulingSchema);

export default Ruling;
