import { Document } from 'mongoose';

import conn from '../db';
import { FormatSchema } from '../schema/format';

export const FormatModel = conn.model('format', FormatSchema);
