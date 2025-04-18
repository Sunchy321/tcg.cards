/** AUTO GENERATED, DO NOT CHANGE **/

import { Model, Schema } from 'mongoose';

import conn from './db';

import { ICardDatabase } from '@common/model/magic/card';

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

        cost: {
            $type: [String],
            set(newValue: string[]) {
                if (newValue == null) {
                    this.__costMap = undefined;
                    return newValue;
                }

                const costMap: Record<string, number> = { };

                for (const c of newValue) {
                    if (/^\d+$/.test(c)) {
                        costMap[''] = Number.parseInt(c, 10);
                    } else {
                        costMap[c] = (costMap[c] ?? 0) + 1;
                    }
                }

                this.__costMap = costMap;

                return newValue;
            },
        },

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

            for (const p of ret.parts) {
                delete p.__costMap;
            }

            return ret;
        },
    },
});

const Card = conn.model('card', CardSchema);

export default Card;
