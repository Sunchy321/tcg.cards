/* eslint-disable @typescript-eslint/ban-types */
import { Schema, Model } from 'mongoose';

import conn from './db';

import { ICardDatabase } from '@common/model/lorcana/card';

import { historyPlugin } from '@/database/updation';

const CardSchema = new Schema<ICardDatabase, Model<ICardDatabase>, {}, {}, {}, {}, '$type'>({
    cardId: String,

    cost:  Number,
    color: [String],

    inkwell: Boolean,

    name:     String,
    typeline: String,
    text:     String,

    type: {
        main: String,
        sub:  [String],
    },

    localization: [{
        _id:      false,
        lang:     String,
        name:     String,
        typeline: String,
        text:     String,
    }],

    lore:      Number,
    strength:  Number,
    willPower: Number,
    moveCost:  Number,

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
    typeKey: '$type',
    toJSON:  {
        transform(doc, ret) {
            delete ret._id;
            delete ret.__v;
            delete ret.__lockedPaths;
            delete ret.__updations;

            return ret;
        },
    },
});

CardSchema.plugin(historyPlugin);

const Card = conn.model('card', CardSchema);

export default Card;
