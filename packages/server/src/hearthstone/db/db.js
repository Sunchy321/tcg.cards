import * as Mongoose from 'mongoose';

import logger from '../../logger';

Mongoose.set('useCreateIndex', true);

const conn = Mongoose.createConnection('mongodb://localhost/hearthstone', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

conn.once('open', () => {
    logger.info('Hearthstone is connected', { category: 'database' });
});

export default conn;
