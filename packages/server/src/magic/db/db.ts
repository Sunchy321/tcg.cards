import * as Mongoose from 'mongoose';

import logger from '../../logger';

Mongoose.set('useCreateIndex', true);

const conn = Mongoose.createConnection('mongodb://localhost/magic', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

conn.once('open', () => {
    logger.info('Magic is connected', { category: 'database' });
});

export default conn;
