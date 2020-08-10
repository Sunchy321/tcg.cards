import { Schema } from 'mongoose';

export const FormatSchema = new Schema({
    formatId: {
        type: String,
        required: true,
        unique: true,
    },

    order: Number,

    localization: [{
        _id:  false,
        lang: String,
        name: String,
    }],

    setList: [{
        _id:  false,
        id: String,
        enterTime: Date,
        leaveTime: Date,
    }],
});
