import { Schema } from 'mongoose';

export interface ICardSchema {
    cardId: string;

    scryfall: {
        id: string;
    };

    arenaId?: string;
    mtgoId?: number;
    mtgoFoilId?: number;
    multiverseId?: [number];
    tcgPlayerId?: number;

    lang: string;
}

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
