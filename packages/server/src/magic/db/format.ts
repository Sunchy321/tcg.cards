import { Document, Schema } from 'mongoose';

import conn from './db';

import { Format as IFormat } from '@interface/magic/format';

const FormatSchema = new Schema<IFormat>({
    formatId: {
        type:     String,
        required: true,
        unique:   true,
    },

    localization: [{ _id: false, lang: String, name: String }],

    sets:    { type: [String], default: undefined },
    banlist: [{ _id: false, card: String, status: String, date: String, group: String }],

    birthday:  String,
    deathdate: String,
}, {
    toJSON: {
        transform(doc, ret) {
            delete ret._id;
            delete ret.__v;
            return ret;
        },
    },
});

const Format = conn.model<IFormat & Document>('format', FormatSchema);

export default Format;
