/** AUTO GENERATED, DO NOT CHANGE **/
import { Model, Schema } from 'mongoose';

import conn from './db';

import { ICardDatabase, toJSON } from '@common/model/ptcg/card';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const CardSchema = new Schema<ICardDatabase, Model<ICardDatabase>, {}, {}, {}, {}, '$type'>({
    cardId: String,

    name:       String,
    text:       String,
    evolveFrom: String,

    localization: [{
        _id: false,

        lang:       String,
        __lastDate: String,
        name:       String,
        text:       String,
        evolveFrom: String,
    }],

    type: {
        main: String,
        sub:  String,
    },

    hp:    Number,
    stage: String,
    types: String,
    level: String,

    vstarPower: {
        type:   String,
        cost:   String,
        name:   String,
        damage: Object,
        effect: String,
    },

    abilities: { $type: [{
        _id: false,

        name:   String,
        effect: String,
    }], default: undefined },

    attacks: { $type: [{
        _id: false,

        cost:   String,
        name:   String,
        damage: String,
        effect: String,
    }], default: undefined },

    rule: String,

    weakness: {
        type:  String,
        value: String,
    },

    resistance: {
        type:  String,
        value: String,
    },

    retreat: Number,

    pokedex: {
        number:   Number,
        category: String,
        height:   String,
        weight:   String,
    },

    category:   String,
    tags:       [String],
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
