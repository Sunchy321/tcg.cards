import { Document } from 'mongoose';

import conn from '../db';
import { RawCardSchema } from '../schema/raw-card';

export const RawCardModel = conn.model('raw-card', RawCardSchema);
