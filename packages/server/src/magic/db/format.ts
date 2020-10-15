import { Document, Schema } from 'mongoose';

import conn from './db';

interface IFormatData {
    formatId: string;
    order: number;
    localization: {
        lang: string;
        name: string;
    }[];
    setList: string[];
}

const FormatSchema = new Schema({
    formatId: {
        type:     String,
        required: true,
        unique:   true,
    },

    order: Number,

    localization: [
        {
            _id:  false,
            lang: String,
            name: String,
        },
    ],

    setList: [String],
});

export interface IFormat extends IFormatData, Document {}

const Format = conn.model<IFormat>('format', FormatSchema);

export default Format;
