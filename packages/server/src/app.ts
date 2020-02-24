import * as Koa from 'koa';
import * as KoaLogger from 'koa-logger';
import * as KoaBody from 'koa-body';

import { enableControl } from '../data/config';
import logger from './logger';

const app = new Koa();

app.listen(8889, () => {
    logger.info('Server is started', { category: 'server'})
});

if (enableControl) {
    const conApp = new Koa();

    conApp.listen(8888, () => {
        logger.info('Control server is started', { category: 'server' })
    })
}