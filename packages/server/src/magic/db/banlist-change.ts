import { Document, Schema } from 'mongoose';

import conn from './db';

import { BanlistChange as IBanlistChange } from '@interface/magic/banlist';

const BanlistChangeSchema = new Schema<IBanlistChange>({
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
