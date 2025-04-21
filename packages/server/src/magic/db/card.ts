/** AUTO GENERATED, DO NOT CHANGE **/
import { Model, Schema } from 'mongoose';

import conn from './db';

import { ICardDatabase, toJSON, costWatcher } from '@common/model/magic/card';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const CardSchema = new Schema<ICardDatabase, Model<ICardDatabase>, {}, {}, {}, {}, '$type'>({
    cardId: String,

    manaValue:     Number,
    colorIdentity: String,

    parts: [{
        _id: false,

        name:     String,
        typeline: String,
        text:     String,

        localization: [{
            _id: false,

            lang:     String,
            lastDate: String,
            name:     String,
            typeline: String,
            text:     String,
        }],

        cost:           { $type: [String], default: undefined, set: costWatcher },
        __costMap:      Object,
        manaValue:      Number,
        color:          String,
        colorIndicator: String,

        type: {
            super: { $type: [String], default: undefined },
            main:  [String],
            sub:   { $type: [String], default: undefined },
        },

        power:        String,
        toughness:    String,
        loyalty:      String,
        defense:      String,
        handModifier: String,
        lifeModifier: String,
    }],

    keywords:       [String],
    counters:       { $type: [String], default: undefined },
    producibleMana: String,
    tags:           [String],

    category:       String,
    legalities:     Object,
    contentWarning: Boolean,

    scryfall: {
        oracleId: [String],
    },

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
