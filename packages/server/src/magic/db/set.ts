import { Schema, Document } from 'mongoose';

import conn from './db';

export interface SetLocalization {
    lang: string,
    name?: string,
    isOfficialName: boolean,
    link?: string,
}

export interface ISet {
    setId: string,

    block?: string,
    parent?: string,

    printedSize?: number,
    cardCount: number,
    langs: string[],
    rarities: string[],

    localization: SetLocalization[],

    setType: string,
    isDigital: boolean,
    isFoilOnly: boolean,
    isNonfoilOnly: boolean,
    symbolStyle: string[],

    releaseDate?: string,

    scryfall: {
        id: string,
        code: string,
    },

    mtgoCode?: string,
    tcgplayerId?: number,

}

export const SetSchema = new Schema({
    setId: String,

    block:  String,
    parent: String,

    printedSize: Number,
    cardCount:   Number,
    langs:       Array,

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
    symbolStyle:   [String],

    releaseDate: String,

    scryfall: {
        id:   String,
        code: String,
    },

    mtgoCode:    String,
    tcgplayerId: Number,
}, {
    toJSON: {
        transform(doc, ret) {
            delete ret._id;
            delete ret.__v;
            return ret;
        },
    },
});

const Set = conn.model<ISet & Document>('set', SetSchema);

export default Set;
