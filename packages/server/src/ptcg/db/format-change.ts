/** AUTO GENERATED, DO NOT CHANGE **/
import { Model, Schema } from 'mongoose';

import conn from './db';

import { FormatChange as IFormatChange } from '@interface/ptcg/format-change';

import { defaultToJSON } from '@common/model/updation';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const FormatChangeSchema = new Schema<IFormatChange, Model<IFormatChange>, {}, {}, {}, {}, '$type'>({
    source: String,
    date:   String,
    format: String,
    link:   { $type: [String], default: undefined },
    type:   String,
    id:     String,
    status: String,
    group:  String,
}, {
    typeKey: '$type',
    toJSON:  { transform: defaultToJSON },
});

const FormatChange = conn.model('format_change', FormatChangeSchema);

export default FormatChange;
