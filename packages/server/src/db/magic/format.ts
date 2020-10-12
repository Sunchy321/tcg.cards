import { Document, Schema } from 'mongoose';

import conn from './db';

export interface IFormat extends Document {}

const FormatSchema = new Schema({
    formatId: {
        type: String,
        required: true,
        unique: true,
    },

    order: Number,

    localization: [
        {
            _id: false,
            lang: String,
            name: String,
        },
    ],

    setList: [
        {
            _id: false,
            id: String,
            enterTime: Date,
            leaveTime: Date,
        },
    ],
});

const Format = conn.model('format', FormatSchema);

export default Format;
