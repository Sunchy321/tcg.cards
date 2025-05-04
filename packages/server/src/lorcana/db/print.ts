/** AUTO GENERATED, DO NOT CHANGE **/
import { Model, Schema } from 'mongoose';

import conn from './db';

import { IPrintDatabase, toJSON } from '@common/model/lorcana/print';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const PrintSchema = new Schema<IPrintDatabase, Model<IPrintDatabase>, {}, {}, {}, {}, '$type'>({
    cardId: String,

    lang:   String,
    set:    String,
    number: String,

    name:     String,
    typeline: String,
    text:     String,

    flavorText: String,
    artist:     String,

    imageUri: Object,

    tags: [String],

    layout:      String,
    rarity:      String,
    releaseDate: String,
    finishes:    { $type: [String], default: undefined },

    id:           Number,
    code:         String,
    tcgPlayerId:  Number,
    cardMarketId: Number,
    cardTraderId: Number,

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

const Print = conn.model('print', PrintSchema);

export default Print;
