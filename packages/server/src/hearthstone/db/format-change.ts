import { Schema } from 'mongoose';

import conn from './db';

import { FormatChange as IFormatChange } from '@interface/hearthstone/format-change';

import { entityEssential } from './entity'

const IFormatChangeSchema = new Schema<IFormatChange>({
    source: String,
    date:   String,
    format: String,
    link:   { type: [String], default: undefined },

    type:   String,
    id:     String,
    status: String,
    entity: entityEssential,
    adjust: {
        type: [{
            _id: false,
            from: entityEssential,
            to: entityEssential
        }],
        default: undefined
    }
});

const FormatChange = conn.model<IFormatChange>('format_change', IFormatChangeSchema);

export default FormatChange;
