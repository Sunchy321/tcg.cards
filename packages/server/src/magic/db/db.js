import Mongoose from 'mongoose';

import * as logger from '../../logger.js';

import { database } from '../../../config';

Mongoose.set('useCreateIndex', true);

const conn = Mongoose.createConnection(`mongodb://${database}/magic`, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

conn.once('open', () => {
    logger.main.info('Magic is connected', { category: 'database' });
});

export default conn;
