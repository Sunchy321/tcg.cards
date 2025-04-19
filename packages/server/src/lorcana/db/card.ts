/** AUTO GENERATED, DO NOT CHANGE **/
import { Model, Schema } from 'mongoose';

import conn from './db';

import { ICardDatabase } from '@common/model/lorcana/card';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
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
        sub:  { $type: [String], default: undefined },
    },

    localization: [{
        _id: false,

        lang:     String,
        name:     String,
        typeline: String,
        text:     String,
    }],

    lore:      Number,
    strength:  Number,
    willPower: Number,
    moveCost:  Number,

    tags: [String],

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
