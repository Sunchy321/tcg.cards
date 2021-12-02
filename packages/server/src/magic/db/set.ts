import { Schema, Document } from 'mongoose';

import conn from './db';

import { Set as ISet } from '@interface/magic/set';

export const SetSchema = new Schema<ISet>({
    setId: String,

    block:  String,
    parent: String,

    printedSize: Number,
    cardCount:   Number,
    langs:       Array,
    rarities:    Array,

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

const Set = conn.model<Document & ISet>('set', SetSchema);

export default Set;
