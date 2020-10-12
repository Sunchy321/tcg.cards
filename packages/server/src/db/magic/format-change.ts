import { Document, Schema } from 'mongoose';

import conn from './db';

export interface IFormatChange extends Document {
    type: string;
    date: string;

    source: string;
    category: string;

    effectiveDate: {
        tabletop: string;
        arena: string;
        online: string;
    };

    nextDate?: string;

    link: string[];

    changes: {
        card: string;
        format: String;
        status: String;
        effectiveDate: String;
    }[];
}

const FormatChangeSchema = new Schema({
    type: String,
    date: String,

    source: String,
    category: String,

    effectiveDate: {
        tabletop: String,
        arena: String,
        online: String,
    },

    nextDate: String,

    link: [String],

    changes: [
        {
            _id: false,
            card: String,
            format: String,
            status: String,
            effectiveDate: String,
        },
    ],
});

const FormatChange = conn.model<IFormatChange>(
    'format_change',
    FormatChangeSchema,
);

export default FormatChange;
