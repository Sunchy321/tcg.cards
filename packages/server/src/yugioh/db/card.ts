/** AUTO GENERATED, DO NOT CHANGE **/
import { Model, Schema } from 'mongoose';

import conn from './db';

import { ICardDatabase, toJSON } from '@common/model/yugioh/card';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const CardSchema = new Schema<ICardDatabase, Model<ICardDatabase>, {}, {}, {}, {}, '$type'>({
    cardId: String,

    localization: [{
        _id: false,

        lang:       String,
        name:       String,
        rubyName:   String,
        typeline:   String,
        text:       String,
        comment:    String,
        __lastDate: String,
    }],

    type: {
        main: String,
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

    konamiId: Number,
    passcode: Number,

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
