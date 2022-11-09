import { Schema } from 'mongoose';

import conn from './db';

import { FormatChange as IFormatChange } from '@interface/hearthstone/format-change';

const IFormatChangeSchema = new Schema<IFormatChange>({
    source:      String,
    date:        String,
    format:      String,
    link:        { type: [String], default: undefined },
    version:     Number,
    lastVersion: Number,

    type:       String,
    id:         String,
    status:     String,
    adjustment: {
        type: [{
            id:     String,
            detail: [{ part: String, status: String }],
        }],
        default: undefined,
    },
});

const FormatChange = conn.model<IFormatChange>('format_change', IFormatChangeSchema);

export default FormatChange;
