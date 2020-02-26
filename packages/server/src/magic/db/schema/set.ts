import { Schema } from 'mongoose';

export interface ISetSchema {
    setId: string;

    scryfall: {
        id: string;
        code: string;
    };

    onlineCode?: string;
    tcgplayerId?: number;

    block?: string;
    parent?: string;

    localization: Array<{
        lang: string;
        name: string;
        block?: string;
        link?: string;
    }>;

    setType: string;
    isDigital: boolean;
    isFoilOnly: boolean;

    releaseDate?: string;

    cardCount: number;
}

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

    localization: [{
        _id: false,
        lang: String,
        name: String,
        block: String,
        link: String,
    }],

    setType: String,
    isDigital: Boolean,
    isFoilOnly: Boolean,

    releaseDate: String,

    cardCount: Number,
});
