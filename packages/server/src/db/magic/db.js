import Mongoose from 'mongoose';

import * as logger from '~/logger';

import { database, dbDataUser, dbDataPassword } from '@/config';

Mongoose.set('useCreateIndex', true);

const conn = Mongoose.createConnection(`mongodb://${database}/magic`, {
    user: dbDataUser,
    pass: dbDataPassword,
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

conn.once('open', () => {
    logger.main.info('Magic is connected', { category: 'database' });
});

export default conn;
