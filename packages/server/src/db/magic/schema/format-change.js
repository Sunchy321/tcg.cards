import { Schema } from 'mongoose';

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
