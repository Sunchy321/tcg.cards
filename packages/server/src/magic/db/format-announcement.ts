import { Schema } from 'mongoose';

import conn from './db';

import { FormatAnnouncement as IFormatAnnouncement } from '@interface/magic/format-change';

const IFormatAnnouncementSchema = new Schema<IFormatAnnouncement>({
    source: String,
    date:   String,

    effectiveDate: {
        tabletop: String,
        online:   String,
        arena:    String,
    },

    nextDate: String,

    link: { type: [String], default: undefined },

    changes: [{
        _id:     false,
        format:  String,
        setIn:   { type: [String], default: undefined },
        setOut:  { type: [String], default: undefined },
        banlist: {
            type: [{
                _id:           false,
                id:            String,
                status:        String,
                effectiveDate: String,
            }],
            default: undefined,
        },
    }],
});

const FormatAnnouncement = conn.model<IFormatAnnouncement>('format_announcement', IFormatAnnouncementSchema);

export default FormatAnnouncement;
