import { Schema } from 'mongoose';

import conn from './db';

import { Format as IFormat } from '@interface/hearthstone/format';

const FormatSchema = new Schema<IFormat>({
    formatId: {
        type:     String,
        required: true,
        unique:   true,
    },

    localization: [{ _id: false, lang: String, name: String }],

    sets:    { type: [String], default: undefined },
    banlist: [{
        _id: false, id: String, status: String, date: String, group: String,
    }],

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

const Format = conn.model<IFormat>('format', FormatSchema);

export default Format;
