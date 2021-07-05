import { Document, Schema } from 'mongoose';

import conn from './db';

export interface IFormat {
    formatId: string;
    localization: { lang: string, name: string }[];
    sets?: string[],
    banlist: { card: string, status: string, date: string, group?: string }[],
    birthday?: string;
    deathdate?: string;
}

const FormatSchema = new Schema({
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
