import { Document } from 'mongoose';

import conn from '../db';
import { VersionSchema } from '../schema/version';

export const VersionModel = conn.model('version', VersionSchema);
