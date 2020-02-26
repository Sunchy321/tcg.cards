import { Schema } from 'mongoose';

export interface IFormatSchema {
    formatId: string;

    order: number;

    localization: Array<{
        lang: string;
        name: string;
    }>;

    setList: Array<{
        id: string;
        enterTime: Date;
        leaveTime: Date;
    }>;
}

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
