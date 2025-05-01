import { Schema } from 'mongoose';

import conn from './db';

import { FormatChange as IFormatChange } from '@interface/lorcana/format-change';

const IFormatChangeSchema = new Schema<IFormatChange>({
    source: String,
    date:   String,
    format: String,
    link:   { type: [String], default: undefined },

    type:   String,
    id:     String,
    status: String,
    group:  String,
});

const FormatChange = conn.model<IFormatChange>('format_change', IFormatChangeSchema);

export default FormatChange;
