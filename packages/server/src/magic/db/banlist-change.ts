import { Document, Schema } from 'mongoose';

import { BanlistStatus } from '../banlist/interface';

import conn from './db';

export interface IBanlistChange {
    date: string;
    category: string;

    effectiveDate?: {
        tabletop?: string;
        online?: string;
        arena?: string;
    };

    nextDate?: string;

    link: string[];

    changes: {
        card: string;
        format: string;
        status?: BanlistStatus;
        effectiveDate?: string;
        detail?: {
            card: string,
            date?: string,
            status?: BanlistStatus,
            group?: string
        }[];
    }[];
}

const BanlistChangeSchema = new Schema({
    date:     String,
    category: String,

    effectiveDate: {
        tabletop: String,
        online:   String,
        arena:    String,
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
            type:    [{ _id: false, card: String, date: String, status: String, group: String }],
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
