import KoaRouter from '@koa/router';
import { Context, DefaultState } from 'koa';

import blzApi from '@/hearthstone/blizzard/api';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/blizzard');

router.get('/metadata', async ctx => {
    ctx.body = await blzApi('/hearthstone/metadata');
});

interface CardBack {
    id: number;
    sortCategory: number;
    text: Record<string, string>;
    name: Record<string, string>;
    image: string;
    slug: string;
}

interface CardBackData {
    cardBacks: CardBack[];
    cardCount: number;
    pageCount: number;
    page: number;
}

router.get('/cardbacks', async ctx => {
    const data = await blzApi<CardBackData>('/hearthstone/cardbacks');

    const result = data.cardBacks;

    for (let i = 2; i <= data.pageCount; i += 1) {
        const newData = await blzApi<CardBackData>('/hearthstone/cardbacks', { page: i });

        result.push(...newData.cardBacks);
    }

    ctx.body = result.sort((a, b) => a.id - b.id);
});

export default router;
