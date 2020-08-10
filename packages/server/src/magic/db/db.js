import Mongoose from 'mongoose';

import * as logger from '../../logger.js';

Mongoose.set('useCreateIndex', true);

const conn = Mongoose.createConnection('mongodb://localhost/magic', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

conn.once('open', () => {
    logger.main.info('Magic is connected', { category: 'database' });
});

export default conn;
