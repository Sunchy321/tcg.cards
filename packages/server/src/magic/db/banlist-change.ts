import { Document, Schema } from 'mongoose';

import { BanlistStatus } from '../banlist/interface';

import conn from './db';

export interface IBanlistChange {
    date: string;

    category: string;

    effectiveDate?: {
        tabletop?: string;
        arena?: string;
        online?: string;
    };

    nextDate?: string;

    link: string[];

    changes: {
        card: string;
        format: string;
        status?: BanlistStatus;
        effectiveDate?: string;
        detail?: { card: string, date?: string }[];
    }[];
}

const BanlistChangeSchema = new Schema({
    date: String,

    category: String,

    effectiveDate: {
        tabletop: String,
        arena:    String,
        online:   String,
    },

    nextDate: String,

    link: [String],

    changes: [{
        _id:           false,
        card:          String,
        format:        String,
        status:        String,
        effectiveDate: String,
        detail:        {
            type:    [{ _id: false, card: String, date: String }],
            default: undefined,
        },
    }],
}, {
    toJSON: {
        transform(doc, ret) {
            delete ret._id;
            delete ret.__v;
            return ret;
        },
    },
});

const BanlistChange = conn.model<IBanlistChange & Document>(
    'banlist_change',
    BanlistChangeSchema,
);

export default BanlistChange;
