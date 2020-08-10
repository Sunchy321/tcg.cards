import { Document } from 'mongoose';

import conn from '../db';
import { FormatChangeSchema } from '../schema/format-change';

export const FormatChangeModel = conn.model('format_change', FormatChangeSchema);
