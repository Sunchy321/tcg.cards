import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';

import Card from '@/ptcg/db/card';
import Print from '@/ptcg/db/print';
import Set from '@/ptcg/db/set';

import DataLoader from '@/ptcg/ptcg-json/index';

import { join } from 'path';
import { existsSync, readdirSync } from 'fs';
import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

import { dataPath } from '@/config';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/ptcg-json');

const bulkPath = join(dataPath, 'ptcg', 'ptcg-json');

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

const dataLoader = new DataLoader();

router.get(
    '/load-data',
    websocket,
    async ctx => {
        const ws = await ctx.ws();

        const { file } = mapValues(ctx.query, toSingle);

        if (file == null) {
            ctx.status = 401;
            ws.close();
        } else {
            dataLoader.init(file);
            dataLoader.bind(ws);
        }

        ctx.status = 200;
    },
);

export default router;
