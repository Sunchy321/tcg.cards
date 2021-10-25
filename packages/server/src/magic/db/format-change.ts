import { Document, Schema } from 'mongoose';

import conn from './db';

import { FormatChange as IFormatChange } from '@interface/magic/format';

const IFormatChangeSchema = new Schema<IFormatChange>({
    date: String,

    changes: {
        type: [{
            _id:      false,
            category: String,
            format:   String,
            in:       [String],
            out:      [String],
        }],
    },
});

const FormatChange = conn.model<IFormatChange & Document>('format_change', IFormatChangeSchema);

export default FormatChange;
