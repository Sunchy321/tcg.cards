import { Document } from 'mongoose';

import conn from '../db';
import { RawRulingSchema } from '../schema/raw-ruling';

export const RawRulingModel = conn.model('raw-ruling', RawRulingSchema);
