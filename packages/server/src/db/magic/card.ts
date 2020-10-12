import { Schema } from 'mongoose';

import conn from './db';

const CardSchema = new Schema({
    cardId: String,

    scryfall: {
        id: String,
    },

    arenaId: String,
    mtgoId: Number,
    mtgoFoilId: Number,
    multiverseId: [Number],
    tcgPlayerId: Number,

    lang: String,
});

const Card = conn.model('card', CardSchema);

export default Card;
