import { Document } from 'mongoose';

import conn from '../db';
import { IFormatSchema, FormatSchema } from '../schema/format';

export interface IFormatDoc extends IFormatSchema, Document {

}

export const FormatModel = conn.model<IFormatDoc>('format', FormatSchema);
