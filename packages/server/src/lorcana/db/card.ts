/* eslint-disable @typescript-eslint/ban-types */
import { Schema, Model } from 'mongoose';

import conn from './db';

import { Card as ICard } from '@interface/lorcana/card';

import { WithUpdation } from '@common/model/updation';

import { historyPlugin } from '@/database/updation';

type ICardDatabase = WithUpdation<ICard>;

const CardSchema = new Schema<ICardDatabase, Model<ICardDatabase>, {}, {}, {}, {}, '$type'>({
    cardId: String,

    cost: Number,

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

            for (const p of ret.parts) {
                delete p.__costMap;
            }

            return ret;
        },
    },
});

CardSchema.plugin(historyPlugin);

const Card = conn.model('card', CardSchema);

export default Card;
