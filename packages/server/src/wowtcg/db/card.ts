/** AUTO GENERATED, DO NOT CHANGE **/
import { Model, Schema } from 'mongoose';

import conn from './db';

import { ICardDatabase } from '@common/model/wowtcg/card';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const CardSchema = new Schema<ICardDatabase, Model<ICardDatabase>, {}, {}, {}, {}, '$type'>({
    cardId: String,

    parts: [{
        _id: false,

        name:     String,
        typeline: String,
        text:     String,

        cost:  Number,
        type:  [String],
        race:  String,
        class: String,

        attack:     String,
        health:     String,
        damageType: String,

        isMaster:   Boolean,
        talentSpec: String,
        profession: { $type: [String], default: undefined },
    }],

    __updations: [{
        _id: false,

        key:       String,
        partIndex: Number,
        lang:      String,
        oldValue:  Object,
        newValue:  Object,
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

const Card = conn.model('card', CardSchema);

export default Card;
