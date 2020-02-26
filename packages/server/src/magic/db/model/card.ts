import { Document } from 'mongoose';

import conn from '../db';
import { ICardSchema, CardSchema } from '../schema/card';

export interface ICardDoc extends ICardSchema, Document { }

export const SetModel = conn.model<ICardDoc>('card', CardSchema);
