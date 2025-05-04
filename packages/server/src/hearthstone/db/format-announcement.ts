/** AUTO GENERATED, DO NOT CHANGE **/
import { Model, Schema } from 'mongoose';

import conn from './db';

import { FormatAnnouncement as IFormatAnnouncement } from '@interface/hearthstone/format-change';

import { defaultToJSON } from '@common/model/updation';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const FormatAnnouncementSchema = new Schema<IFormatAnnouncement, Model<IFormatAnnouncement>, {}, {}, {}, {}, '$type'>({
    source:        String,
    date:          String,
    effectiveDate: String,
    name:          String,
    link:          { $type: [String], default: undefined },
    version:       Number,
    lastVersion:   Number,

    changes: [{
        _id: false,

        format:        String,
        effectiveDate: String,
        setIn:         { $type: [String], default: undefined },
        setOut:        { $type: [String], default: undefined },
        banlist:       { $type: [{
            _id: false,

            id:     String,
            status: String,
        }], default: undefined },
        adjustment: { $type: [{
            _id: false,

            id:     String,
            status: String,
            detail: [{
                _id: false,

                part:   String,
                status: String,
            }],
            related: { $type: [String], default: undefined },
        }], default: undefined },
    }],
}, {
    typeKey: '$type',
    toJSON:  { transform: defaultToJSON },
});

const FormatAnnouncement = conn.model('format_announcement', FormatAnnouncementSchema);

export default FormatAnnouncement;
