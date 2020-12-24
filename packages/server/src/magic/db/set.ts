import { Schema, Document } from 'mongoose';

import conn from './db';

interface ISetLocalization {
    lang: string,
    name: string,
    isOfficialName: boolean,
    link?: string,
}

export interface ISet {
    setId: string,

    scryfall: {
        id: string,
        code: string,
    },

    mtgoCode?: string,
    tcgplayerId?: number,

    block?: string,
    parent?: string,

    localization: ISetLocalization[],

    setType: string,
    isDigital: boolean,
    isFoilOnly: boolean,
    isNonfoilOnly: boolean,

    releaseDate?: string,

    cardCount: number,
    printedSize?: number,
}

export const SetSchema = new Schema({
    setId: String,

    scryfall: {
        id:   String,
        code: String,
    },

    mtgoCode:    String,
    tcgplayerId: Number,

    block:  String,
    parent: String,

    localization: [{
        _id:            false,
        lang:           String,
        name:           String,
        isOfficialName: Boolean,
        link:           String,
    }],

    setType:       String,
    isDigital:     Boolean,
    isFoilOnly:    Boolean,
    isNonfoilOnly: Boolean,

    releaseDate: String,

    cardCount:   Number,
    printedSize: Number,
});

const Set = conn.model<ISet & Document>('set', SetSchema);

export default Set;
