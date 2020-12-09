import { Document, Schema } from 'mongoose';

import conn from './db';

interface IFormat {
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

const Format = conn.model<IFormat & Document>('format', FormatSchema);

export default Format;
