/** AUTO GENERATED, DO NOT CHANGE **/
import { Model, Schema } from 'mongoose';

import conn from './db';

import { FormatAnnouncement as IFormatAnnouncement } from '@interface/yugioh/format-change';

import { defaultToJSON } from '@common/model/updation';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const FormatAnnouncementSchema = new Schema<IFormatAnnouncement, Model<IFormatAnnouncement>, {}, {}, {}, {}, '$type'>({
    source: String,
    date:   String,

    effectiveDate: String,
    nextDate:      String,

    link: { $type: [String], default: undefined },

    changes: [{
        _id: false,

        format:  String,
        setIn:   { $type: [String], default: undefined },
        setOut:  { $type: [String], default: undefined },
        banlist: { $type: [{
            _id: false,

            id:            String,
            status:        String,
            effectiveDate: String,
        }], default: undefined },
    }],
}, {
    typeKey: '$type',
    toJSON:  { transform: defaultToJSON },
});

const FormatAnnouncement = conn.model('format_announcement', FormatAnnouncementSchema);

export default FormatAnnouncement;
