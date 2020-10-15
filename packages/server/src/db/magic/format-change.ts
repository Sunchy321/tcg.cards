import { Document, Schema } from 'mongoose';

import conn from './db';

interface IFormatChangeData {
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
        format: string;
        status: string;
        effectiveDate: string;
    }[];
}

const FormatChangeSchema = new Schema({
    type: String,
    date: String,

    source:   String,
    category: String,

    effectiveDate: {
        tabletop: String,
        arena:    String,
        online:   String,
    },

    nextDate: String,

    link: [String],

    changes: [
        {
            _id:           false,
            card:          String,
            format:        String,
            status:        String,
            effectiveDate: String,
        },
    ],
});

export interface IFormatChange extends IFormatChangeData, Document {}

const FormatChange = conn.model<IFormatChange>(
    'format_change',
    FormatChangeSchema,
);

export default FormatChange;
