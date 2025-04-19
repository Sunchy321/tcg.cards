/** AUTO GENERATED, DO NOT CHANGE **/
import { Model, Schema } from 'mongoose';

import conn from './db';

import { ICardDatabase } from '@common/model/hearthstone/card';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const CardSchema = new Schema<ICardDatabase, Model<ICardDatabase>, {}, {}, {}, {}, '$type'>({
    cardId: String,

    entityId: [String],

    legality: Object,

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
