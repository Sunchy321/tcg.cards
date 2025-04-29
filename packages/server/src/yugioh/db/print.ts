import { Schema } from 'mongoose';

import conn from './db';

import { IPrintDatabase } from '@common/model/yugioh/print';

const IPrintSchema = new Schema<IPrintDatabase>({
    cardId: Number,

    lang:   String,
    set:    String,
    number: String,

    name:     String,
    typeline: String,
    text:     String,

    tags:   [String],
    rarity: String,

    layout: String,

    __updations: [{
        _id:      false,
        key:      String,
        oldValue: {},
        newValue: {},
    }],

    __lockedPaths: [String],
}, {
    toJSON: {
        transform(doc, ret) {
            delete ret._id;
            delete ret.__v;
            delete ret.__updations;
            delete ret.__lockedPaths;

            return ret;
        },
    },
});

const Print = conn.model('print', IPrintSchema);

export default Print;
