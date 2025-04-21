/** AUTO GENERATED, DO NOT CHANGE **/
import { Model, Schema } from 'mongoose';

import conn from './db';

import { ICardDatabase, toJSON } from '@common/model/hearthstone/card';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const CardSchema = new Schema<ICardDatabase, Model<ICardDatabase>, {}, {}, {}, {}, '$type'>({
    cardId: String,

    change: String,

    legality: Object,

    __updations: [{
        _id: false,

        key:      String,
        oldValue: Object,
        newValue: Object,
    }],

    __lockedPaths: [String],
}, {
    typeKey: '$type',
    toJSON:  { transform: toJSON },
});

const Card = conn.model('card', CardSchema);

export default Card;
