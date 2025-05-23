/** AUTO GENERATED, DO NOT CHANGE **/
import { Model, Schema } from 'mongoose';

import conn from './db';

import { Format as IFormat } from '@interface/ptcg/format';

import { defaultToJSON } from '@common/model/updation';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const FormatSchema = new Schema<IFormat, Model<IFormat>, {}, {}, {}, {}, '$type'>({
    formatId:     String,
    localization: [{
        _id: false,

        lang: String,
        name: String,
    }],
    sets:    { $type: [String], default: undefined },
    banlist: [{
        _id: false,

        id:     String,
        status: String,
        date:   String,
        group:  String,
    }],
    birthday:  String,
    deathdate: String,
    isEternal: Boolean,
}, {
    typeKey: '$type',
    toJSON:  { transform: defaultToJSON },
});

const Format = conn.model('format', FormatSchema);

export default Format;
