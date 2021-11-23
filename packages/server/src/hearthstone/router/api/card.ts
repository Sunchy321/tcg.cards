import KoaRouter from '@koa/router';
import { Context, DefaultState } from 'koa';

import Entity from '@/hearthstone/db/entity';

import { mapValues, random } from 'lodash';
import { toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/card');

router.get('/', async ctx => {
    const { id, version } = mapValues(ctx.query, toSingle);

    if (id == null) {
        ctx.status = 400;
        return;
    }

    const entities = await Entity.find({ cardId: id }).sort({ version: -1 });

    const entity = (() => {
        if (version != null) {
            for (const e of entities) {
                if (e.version === Number.parseInt(version, 10)) {
                    return e;
                }
            }
        }

        return entities[0];
    })();

    ctx.body = {
        ...entity.toJSON(),
        versions: entities.map(e => e.version),
    };
});

router.get('/random', async ctx => {
    // const q = toSingle(ctx.query.q ?? '');

    // const cardIds = q !== ''
    // ? (await searcher.search(q, { 'only-id': '' })).result?.cards as string[]
    // : await Card.distinct('cardId');

    const entityIds = await Entity.distinct('cardId');

    ctx.body = entityIds[random(entityIds.length - 1)] ?? '';
});

export default router;
