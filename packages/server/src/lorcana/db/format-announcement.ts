import { Schema } from 'mongoose';

import conn from './db';

import { FormatAnnouncement as IFormatAnnouncement } from '@interface/lorcana/format-change';

const IFormatAnnouncementSchema = new Schema<IFormatAnnouncement>({
    source:        String,
    date:          String,
    effectiveDate: String,
    link:          { type: [String], default: undefined },

    changes: [{
        _id:           false,
        format:        String,
        effectiveDate: String,
        setIn:         { type: [String], default: undefined },
        setOut:        { type: [String], default: undefined },
        banlist:       {
            type: [{
                _id:    false,
                id:     String,
                status: String,
            }],
            default: undefined,
        },
    }],
});

const FormatAnnouncement = conn.model<IFormatAnnouncement>('format_announcement', IFormatAnnouncementSchema);

export default FormatAnnouncement;
