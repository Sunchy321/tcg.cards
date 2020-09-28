import { Document } from 'mongoose';

import conn from '../db';
import { CardSchema } from '../schema/card';

export const CardModel = conn.model('card', CardSchema);
