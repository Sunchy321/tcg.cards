/** AUTO GENERATED, DO NOT CHANGE **/
import { Model, Schema } from 'mongoose';

import conn from './db';

import { ICardDatabase } from '@common/model/yugioh/card';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const CardSchema = new Schema<ICardDatabase, Model<ICardDatabase>, {}, {}, {}, {}, '$type'>({
    cardId: String,

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

    type: {
        main: [String],
        sub:  { $type: [String], default: undefined },
    },

    attribute:   String,
    level:       Number,
    rank:        Number,
    linkValue:   Number,
    linkMarkers: { $type: [String], default: undefined },
    attack:      Object,
    defense:     Object,
    race:        String,

    pendulumScale: {
        left:  Number,
        right: Number,
    },

    tags: [String],

    category:   String,
    legalities: Object,

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
