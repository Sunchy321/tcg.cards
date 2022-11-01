import KoaRouter from '@koa/router';
import { Context, DefaultState } from 'koa';

import Entity from '@/hearthstone/db/entity';
import { Entity as IEntity } from '@interface/hearthstone/entity';

import {
    flatten, mapValues, omit, random,
} from 'lodash';

import { toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/card');

router.get('/', async ctx => {
    const { id, version: versionText } = mapValues(ctx.query, toSingle);

    if (id == null) {
        ctx.status = 400;
        return;
    }

    const version = versionText != null ? Number.parseInt(versionText, 10) : null;

    if (versionText != null && Number.isNaN(version)) {
        ctx.status = 400;
        return;
    }

    const query: any = { cardId: id, cardType: { $ne: 'enchantment' } };

    if (version != null) {
        query.versions = version;
    }

    const entities = await Entity.find(query).sort({ version: -1 });

    const entity = (() => {
        if (version != null) {
            for (const e of entities) {
                if (e.versions.includes(version)) {
                    return e;
                }
            }
        }

        return entities[0];
    })();

    ctx.body = {
        ...entity.toJSON(),
        versions: flatten(entities.map(e => e.versions)),
    };
});

router.get('/name', async ctx => {
    const { name, version: versionText } = mapValues(ctx.query, toSingle);

    if (name == null) {
        ctx.status = 400;
        return;
    }

    const version = versionText != null ? Number.parseInt(versionText, 10) : null;

    if (versionText != null && Number.isNaN(version)) {
        ctx.status = 400;
        return;
    }

    const query: any = { 'localization.name': name, 'cardType': { $ne: 'enchantment' } };

    if (version != null) {
        query.versions = version;
    }

    const entities = await Entity.aggregate<{ _id: string, data: IEntity[] }>()
        .match(query)
        .sort({ version: -1 })
        .group({ _id: '$cardId', data: { $push: '$$ROOT' } });

    ctx.body = entities.map(v => {
        const entity = (
            version != null ? v.data.filter(d => d.versions.includes(version)) : v.data
        )[0];

        return {
            ...omit(entity, ['_id', '__v']),
            versions: flatten(v.data.map(e => e.versions)),
        };
    });
});

router.get('/random', async ctx => {
    const entityIds = await Entity.distinct('cardId');

    ctx.body = entityIds[random(entityIds.length - 1)] ?? '';
});

export default router;
