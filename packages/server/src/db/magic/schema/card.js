import { Schema } from 'mongoose';

export const CardSchema = new Schema({
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
