import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';

import Card from '@/lorcana/db/card';
import Print from '@/lorcana/db/print';
import Set from '@/lorcana/db/set';

import CardLoader from '@/lorcana/lorcana-json/index';

import { join } from 'path';
import { existsSync, readdirSync } from 'fs';

import { dataPath } from '@/config';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/yugioh-history');

const bulkPath = join(dataPath, 'lorcana', 'lorcana-json');

router.get('/', async ctx => {
    let bulk: string[] = [];

    if (existsSync(bulkPath)) {
        const content = readdirSync(bulkPath);

        bulk = content
            .filter(v => v.endsWith('.json'))
            .map(v => v.replace(/\.json$/, ''));
    }

    ctx.body = {
        bulk,
        database: {
            card:  await Card.estimatedDocumentCount(),
            print: await Print.estimatedDocumentCount(),
            set:   await Set.estimatedDocumentCount(),
        },
    };
});

const cardLoader = new CardLoader();

router.get(
    '/load-card',
    websocket,
    async ctx => {
        cardLoader.bind(await ctx.ws());

        ctx.status = 200;
    },
);

export default router;
