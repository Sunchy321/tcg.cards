import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import { createReadStream, existsSync } from 'fs';
import mime from 'mime-types';
import { flatten, mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

import Entity from '@/hearthstone/db/entity';

import { cardImagePath } from '@/hearthstone/image';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/entity');

router.get('/', async ctx => {
    const {
        id, lang, version: versionText, variant = 'normal',
    } = mapValues(ctx.query, toSingle);

    if (id == null) {
        ctx.status = 400;
        return;
    }

    const version = await (async () => {
        if (versionText != null) {
            const result = Number.parseInt(versionText, 10);

            if (!Number.isNaN(result)) {
                return result;
            } else {
                return null;
            }
        } else {
            const entities = await Entity.find({ entityId: id });

            if (entities.length === 0) {
                return null;
            }

            const versions = flatten(entities.map(e => e.version));

            return Math.max(...versions);
        }
    })();

    if (version == null) {
        ctx.status = 400;
        return;
    }

    const path = cardImagePath(id, lang, version, variant);

    if (existsSync(path)) {
        ctx.response.set('content-type', mime.lookup(path) as string);
        ctx.body = createReadStream(path);
    }
});

export default router;
