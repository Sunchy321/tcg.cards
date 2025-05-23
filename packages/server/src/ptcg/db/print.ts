/** AUTO GENERATED, DO NOT CHANGE **/
import { Model, Schema } from 'mongoose';

import conn from './db';

import { IPrintDatabase, toJSON } from '@common/model/ptcg/print';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const PrintSchema = new Schema<IPrintDatabase, Model<IPrintDatabase>, {}, {}, {}, {}, '$type'>({
    cardId: String,

    lang:   String,
    set:    String,
    number: String,

    name: String,
    text: String,

    rarity: String,
    tags:   [String],

    typeline: String,
    passcode: Number,
    layout:   String,

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
