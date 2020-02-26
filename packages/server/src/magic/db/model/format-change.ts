import { Document } from 'mongoose';

import conn from '../db';
import { IFormatChangeSchema, FormatChangeSchema } from '../schema/format-change';

export interface IFormatChange extends IFormatChangeSchema, Document {

}

export const FormatChangeModel = conn.model<IFormatChange>('format_change', FormatChangeSchema);
