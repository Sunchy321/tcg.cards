/** AUTO GENERATED, DO NOT CHANGE **/
import { Model, Schema } from 'mongoose';

import conn from './db';

import { ICardDatabase, toJSON } from '@common/model/ptcg/card';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const CardSchema = new Schema<ICardDatabase, Model<ICardDatabase>, {}, {}, {}, {}, '$type'>({
    cardId: String,

    name: String,
    text: String,

    localization: [{
        _id: false,

        lang:       String,
        __lastDate: String,
        name:       String,
        text:       String,
    }],

    type: {
        main: String,
        sub:  String,
    },

    hp:    Number,
    stage: String,
    types: { $type: [String], default: undefined },

    abilities: { $type: [{
        _id: false,

        name:   String,
        effect: String,
    }], default: undefined },

    attacks: { $type: [{
        _id: false,

        cost:   [String],
        name:   String,
        damage: {
            amount: Number,
            suffix: String,
        },
        effect: String,
    }], default: undefined },

    rule: String,

    weakness: {
        type:  [String],
        value: String,
    },

    resistance: {
        type:  [String],
        value: String,
    },

    retreat: Number,

    tags: [String],

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
