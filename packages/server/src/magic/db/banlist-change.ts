import { Document, Schema } from 'mongoose';

import { BanlistStatus } from '../banlist/interface';

import conn from './db';

export interface IBanlistChange {
    date: string;

    source: string;
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
        status: BanlistStatus;
        effectiveDate?: string;
    }[];
}

const BanlistChangeSchema = new Schema({
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

    changes: [{
        _id:           false,
        card:          String,
        format:        String,
        status:        String,
        effectiveDate: String,
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
