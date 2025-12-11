import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import websocket from '@/middlewares/websocket';

import Card from '@/magic/db/card';
import Print from '@/magic/db/print';
import Set from '@/magic/db/set';

import BulkGetter from '@/magic/scryfall/data/bulk';
import CardLoader from '@/magic/scryfall/data/card';
import RulingLoader from '@/magic/scryfall/data/ruling';
import SetGetter from '@/magic/scryfall/data/set';

import { mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/scryfall');

const setGetter = new SetGetter();

router.get(
    '/get-set',
    websocket,
    async ctx => {
        setGetter.bind(await ctx.ws());
        ctx.status = 200;
    },
);

export default router;
