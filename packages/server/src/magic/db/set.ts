import { Schema } from 'mongoose';

import conn from '../db';

export const SetSchema = new Schema({
    setId: String,

    scryfall: {
        id: String,
        code: String,
    },

    onlineCode: String,
    tcgplayerId: Number,

    block: String,
    parent: String,

    localization: [
        {
            _id: false,
            lang: String,
            name: String,
            block: String,
            link: String,
        },
    ],

    setType: String,
    isDigital: Boolean,
    isFoilOnly: Boolean,

    releaseDate: String,

    cardCount: Number,
});

const Set = conn.model('set', SetSchema);

export default Set;
