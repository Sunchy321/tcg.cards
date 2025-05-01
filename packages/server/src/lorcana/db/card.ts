/** AUTO GENERATED, DO NOT CHANGE **/
import { Model, Schema } from 'mongoose';

import conn from './db';

import { ICardDatabase, toJSON } from '@common/model/lorcana/card';

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

    category:   String,
    legalities: Object,

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
