import { Document } from 'mongoose';

import conn from '../db';
import { SetSchema } from '../schema/set';

export const SetModel = conn.model('set', SetSchema);
