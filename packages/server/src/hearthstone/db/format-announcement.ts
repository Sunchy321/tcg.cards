import { Schema } from 'mongoose';

import conn from './db';

import { FormatAnnouncement as IFormatAnnouncement } from '@interface/hearthstone/format-change';

const IFormatAnnouncementSchema = new Schema<IFormatAnnouncement>({
    source:        String,
    date:          String,
    effectiveDate: String,
    name:          String,
    link:          { type: [String], default: undefined },
    version:       Number,
    lastVersion:   Number,

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
        adjustment: {
            type: [{
                _id:     false,
                id:      String,
                status:  String,
                detail:  [{ _id: false, part: String, status: String }],
                related: { type: [String], default: undefined },
            }],
            default: undefined,
        },
    }],
});

const FormatAnnouncement = conn.model<IFormatAnnouncement>('format_announcement', IFormatAnnouncementSchema);

export default FormatAnnouncement;
