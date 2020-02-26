import { Schema } from 'mongoose';

export interface IFormatChangeSchema {
    type: string;
    date: string;

    source?: string;
    category?: string;

    effectiveDate?: {
        tabletop?: string;
        arena?: string;
        online?: string;
    };

    nextDate?: string;

    link?: string[];

    changes?: Array<{
        card: string,
        format: string
        status: string,
        effectiveDate?: string,
    }>;
}

export const FormatChangeSchema = new Schema({
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

    changes: [{
        _id: false,
        card: String,
        format: String,
        status: String,
        effectiveDate: String,
    }],
});
