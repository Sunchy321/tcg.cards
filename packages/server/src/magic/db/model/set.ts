import { Document } from 'mongoose';

import conn from '../db';
import { ISetSchema, SetSchema } from '../schema/set';

export interface ISetDoc extends ISetSchema, Document { }

export const SetModel = conn.model<ISetDoc>('set', SetSchema);
