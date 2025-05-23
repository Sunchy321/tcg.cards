import KoaRouter from '@koa/router';
import { Context, DefaultState } from 'koa';

import Entity from '@/hearthstone/db/entity';
import CardRelation from '@/hearthstone/db/card-relation';

import { Entity as IEntity } from '@interface/hearthstone/entity';
import { RelatedCard } from '@common/model/hearthstone/entity';

import {
    flatten, last, mapValues, omit, random, uniq,
} from 'lodash';

import sorter from '@common/util/sorter';
import { toMultiple, toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/entity');

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

    const entities = await Entity.find({ cardId: id }).sort({ version: -1 });

    if (entities.length === 0) {
        ctx.status = 404;
        return;
    }

    const entity = entities.find(e => e.version.includes(version ?? 0)) ?? entities[0];

    const buckets = entities.map(e => e.version);

    const versions = [];

    for (const v of flatten(buckets).sort((a, b) => b - a)) {
        if (versions.length === 0) {
            versions.push([v]);
            continue;
        }

        const u = last(last(versions))!;

        const lastBucket = buckets.findIndex(b => b.includes(u));
        const thisBucket = buckets.findIndex(b => b.includes(v));

        if (lastBucket !== thisBucket) {
            versions.push([v]);
        } else {
            last(versions)!.push(v);
        }
    }

    const sourceRelation = await CardRelation.aggregate<RelatedCard>()
        .match({ sourceId: id, version: { $in: entity.version } })
        .project({
            _id:      false,
            relation: '$relation',
            cardId:   '$targetId',
        })
        .group({
            _id: {
                relation: '$relation',
                cardId:   '$cardId',
            },
        })
        .lookup({
            from: 'entities',
            let:  {
                cardId: '$_id.cardId',
            },
            pipeline: [
                { $match: {
                    $expr:   { $eq: ['$cardId', '$$cardId'] },
                    version: { $in: entity.version },
                } },
                { $sort: { version: -1 } },
                { $project: {
                    _id: '$version',
                } },
            ],
            as: 'version',
        })
        .unwind('version')
        .group({
            _id: {
                relation: '$_id.relation',
                cardId:   '$_id.cardId',
            },
            version: {
                $first: '$version._id',
            },
        })
        .replaceRoot({
            relation: '$_id.relation',
            cardId:   '$_id.cardId',
            version:  '$version',
        });

    sourceRelation.sort(
        sorter.pick<RelatedCard, 'relation'>('relation', sorter.string).or(
            sorter.pick<RelatedCard, 'cardId'>('cardId', sorter.string),
        ),
    );

    const targetRelation = await CardRelation.aggregate<RelatedCard>()
        .match({ targetId: id, version: { $in: entity.version } })
        .project({
            _id:      false,
            relation: 'source',
            cardId:   '$sourceId',
        })
        .group({
            _id: {
                relation: '$relation',
                cardId:   '$cardId',
            },
        })
        .lookup({
            from: 'entities',
            let:  {
                cardId: '$_id.cardId',
            },
            pipeline: [
                { $match: {
                    $expr:   { $eq: ['$cardId', '$$cardId'] },
                    version: { $in: entity.version },
                } },
                { $sort: { version: -1 } },
                { $project: {
                    _id: '$version',
                } },
            ],
            as: 'version',
        })
        .unwind('version')
        .group({
            _id: {
                relation: '$_id.relation',
                cardId:   '$_id.cardId',
            },
            version: {
                $first: '$version._id',
            },
        })
        .replaceRoot({
            relation: '$_id.relation',
            cardId:   '$_id.cardId',
            version:  '$version',
        });

    targetRelation.sort(sorter.pick('cardId', sorter.string));

    ctx.body = {
        ...entity.toJSON(),
        versions,
        relatedCards: [...sourceRelation, ...targetRelation],
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

    const query: any = { 'localization.name': name, 'type': { $ne: 'enchantment' } };

    if (version != null) {
        query.version = version;
    }

    const entities = await Entity.aggregate<{ _id: string, data: IEntity[] }>()
        .match(query)
        .sort({ version: -1 })
        .group({ _id: '$cardId', data: { $push: '$$ROOT' } });

    ctx.body = entities.map(v => {
        const entity = (
            version != null ? v.data.filter(d => d.version.includes(version)) : v.data
        )[0];

        return {
            ...omit(entity, ['_id', '__v']),
            versions: v.data.map(e => e.version.sort((a, b) => a - b)),
        };
    });
});

router.get('/random', async ctx => {
    const cardIds = await Entity.distinct('cardId', {
        type: {
            $nin: ['enchantment', 'mercenary_ability'],
        },
    });

    ctx.body = cardIds[random(cardIds.length - 1)] ?? '';
});

interface EntityProfile {
    cardId: string;

    localization: {
        lang: string;
        name: string;
    }[];

    versions: number[][];
}

router.get('/profile', async ctx => {
    const ids = toMultiple(ctx.query.ids ?? '');

    if (ids.length === 0) {
        ctx.status = 400;
        return;
    }

    const fullEntities = await Entity.find({ cardId: { $in: ids } });

    const result: Record<string, EntityProfile> = {};

    for (const id of ids) {
        const entities = fullEntities.filter(e => e.cardId === id);

        const buckets = entities.map(e => e.version);

        const versions: number[][] = [];

        for (const v of flatten(buckets).sort((a, b) => b - a)) {
            if (versions.length === 0) {
                versions.push([v]);
                continue;
            }

            const u = last(last(versions))!;

            const lastBucket = buckets.findIndex(b => b.includes(u));
            const thisBucket = buckets.findIndex(b => b.includes(v));

            if (lastBucket !== thisBucket) {
                versions.push([v]);
            } else {
                last(versions)!.push(v);
            }
        }

        const entity = entities.find(e => e.version.includes(versions[0][0])) ?? entities[0];

        result[id] = {
            cardId:       entity.cardId,
            localization: entity.localization.map(l => ({ lang: l.lang, name: l.name })),
            versions,
        };
    }

    ctx.body = result;
});

function isEqual<T>(result: T): boolean {
    if (Array.isArray(result)) {
        return result.every(isEqual);
    }

    if (typeof result === 'object') {
        return Object.keys(result as object).every(k => isEqual((result as any)[k]));
    }

    return result == null;
}

function compare<T>(lhs: T, rhs: T): any {
    if (Array.isArray(lhs)) {
        if (!Array.isArray(rhs)) {
            return [lhs, rhs];
        }

        if (lhs.every(v => ['number', 'string'].includes(typeof v))) {
            if (lhs.length !== rhs.length) {
                return [lhs, rhs];
            }

            if (lhs.some((v, i) => v !== rhs[i])) {
                return [lhs, rhs];
            }

            return undefined;
        } else {
            const length = Math.max(lhs.length, rhs.length);

            const result: any[] = [];

            for (let i = 0; i < length; i += 1) {
                const r = compare((lhs as any)[i], (rhs as any)[i]);

                if (r != null) {
                    result[i] = r;
                }
            }

            return isEqual(result) ? undefined : result;
        }
    }

    if (typeof lhs === 'object') {
        if (typeof rhs !== 'object') {
            return [lhs, rhs];
        }

        const keys = uniq([...Object.keys(lhs as any), ...Object.keys(rhs as any)]);

        const result: any = {};

        for (const k of keys) {
            const r = compare((lhs as any)[k], (rhs as any)[k]);

            if (r != null) {
                result[k] = r;
            }
        }

        return isEqual(result) ? undefined : result;
    }

    return lhs === rhs ? undefined : [lhs, rhs];
}

router.get('/compare', async ctx => {
    const { id, lv, rv } = mapValues(ctx.query, toSingle);

    const lvm = Number.parseInt(lv, 10);
    const rvm = Number.parseInt(rv, 10);

    if (Number.isNaN(lvm) || Number.isNaN(rvm)) {
        ctx.status = 400;
        return;
    }

    const entities = await Entity.find({ cardId: id, version: { $in: [lvm, rvm] } }).sort({ version: 1 });

    if (entities.length !== 2) {
        ctx.status = 400;
        return;
    }

    ctx.body = compare(entities[0].toJSON(), entities[1].toJSON()) ?? {};
});

export default router;
