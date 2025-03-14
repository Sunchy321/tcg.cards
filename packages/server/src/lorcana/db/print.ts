import { Schema } from 'mongoose';

import conn from './db';

import { Print as IPrint } from '@interface/lorcana/print';
import { WithUpdation } from '@common/model/updation';

const IPrintSchema = new Schema<WithUpdation<IPrint>>({
    cardId: String,

    lang:   String,
    set:    String,
    number: String,

    name:     String,
    typeline: String,
    text:     String,

    flavorText: String,
    artist:     String,

    imageUri: Object,

    layout:   String,
    rarity:   String,
    finishes: [String],

    id:           Number,
    code:         String,
    tcgPlayerId:  Number,
    cardMarketId: Number,
    cardTraderId: Number,

    __updations: [{
        _id:       false,
        key:       String,
        partIndex: Number,
        lang:      String,
        oldValue:  {},
        newValue:  {},
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
