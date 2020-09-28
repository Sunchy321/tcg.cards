import Mongoose from 'mongoose';

import * as logger from '~/logger';

import { database, dbUserUser, dbUserPassword } from '@/config';

Mongoose.set('useCreateIndex', true);

const conn = Mongoose.createConnection(`mongodb://${database}/user`, {
    user: dbUserUser,
    pass: dbUserPassword,
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

conn.once('open', () => {
    logger.main.info('User database is connected', { category: 'database' });
});

export default conn;
