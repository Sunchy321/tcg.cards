import { Schema } from 'mongoose';

import conn from './db';

import { FormatAnnouncement as IFormatAnnouncement } from '@interface/hearthstone/format-change';

import { entityEssential } from './entity';

const IFormatAnnouncementSchema = new Schema<IFormatAnnouncement>({
    source: String,
    date:   String,

    effectiveDate: String,

    link: { type: [String], default: undefined },

    changes: [{
        _id:     false,
        format:  String,
        setIn:   { type: [String], default: undefined },
        setOut:  { type: [String], default: undefined },
        banlist: {
            type: [{
                _id:    false,
                id:     String,
                status: String,
            }],
            default: undefined,
        },
        adjust: {
            type: [{
                _id:    false,
                status: String,
                from:   entityEssential,
                to:     entityEssential,
                entity: [entityEssential],
            }],
        },
    }],
});

const FormatAnnouncement = conn.model<IFormatAnnouncement>('format_announcement', IFormatAnnouncementSchema);

export default FormatAnnouncement;
