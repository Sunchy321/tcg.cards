import { Document } from 'mongoose';

import conn from '../db';
import { CardSchema } from '../schema/card';

export const SetModel = conn.model('card', CardSchema);
