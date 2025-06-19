/** AUTO GENERATED, DO NOT CHANGE **/
import { Model, Schema } from 'mongoose';

import conn from './db';

import { IPrintDatabase, toJSON } from '@common/model/yugioh/print';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const PrintSchema = new Schema<IPrintDatabase, Model<IPrintDatabase>, {}, {}, {}, {}, '$type'>({
    cardId: String,

    lang:   String,
    set:    String,
    number: String,

    name:     String,
    rubyName: String,
    typeline: String,
    text:     String,
    comment:  String,

    layout:      String,
    passcode:    Number,
    rarity:      String,
    releaseDate: String,

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

const Print = conn.model('print', PrintSchema);

export default Print;
