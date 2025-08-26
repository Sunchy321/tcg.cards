import KoaRouter from '@koa/router';
import { Context, DefaultState } from 'koa';

import EntityOld from '@/hearthstone/db/entity';

import { db } from '@/drizzle';
import { Entity, EntityView } from '@/hearthstone/schema/entity';
import { CardRelation } from '@/hearthstone/schema/card-relation';
import { and, desc, eq, notInArray, sql } from 'drizzle-orm';

import { Entity as IEntity } from '@interface/hearthstone/entity';

import {
    flatten, groupBy, last, mapValues, random, uniq,
} from 'lodash';

import { toMultiple, toSingle } from '@/common/request-helper';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/entity');

router.get('/', async ctx => {
    const { id, lang, version: versionText } = mapValues(ctx.query, toSingle);

    if (id == null || lang == null) {
        ctx.status = 400;
        return;
    }

    const version = versionText != null ? Number.parseInt(versionText, 10) : null;

    if (versionText != null && Number.isNaN(version)) {
        ctx.status = 400;
        return;
    }

    const entities = await db.select()
        .from(EntityView)
        .where(and(
            eq(EntityView.cardId, id),
            eq(sql`any(${Entity.version})`, version),
            eq(EntityView.lang, lang),
        ))
        .orderBy(desc(EntityView.version));

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

    const sourceRelation = await db.select({
        relation: CardRelation.relation,
        cardId:   CardRelation.targetId,
        version:  CardRelation.version,
    })
        .from(CardRelation)
        .where(eq(CardRelation.sourceId, id))
        .orderBy(CardRelation.relation, CardRelation.targetId);

    const targetRelation = await db.select({
        relation: sql`source`.as('relation'),
        cardId:   CardRelation.sourceId,
        version:  CardRelation.version,
    })
        .from(CardRelation)
        .where(eq(CardRelation.targetId, id))
        .orderBy(CardRelation.sourceId);

    ctx.body = {
        entity,
        versions,
        relatedCards: [...sourceRelation, ...targetRelation],
    };
});

router.get('/random', async ctx => {
    const cardIds = await db.selectDistinct({ cardId: Entity.cardId })
        .from(Entity)
        .where(notInArray(Entity.type, ['enchantment', 'mercenary_ability']));

    ctx.body = cardIds[random(cardIds.length - 1)].cardId ?? '';
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

    const fullEntities = await EntityOld.find({ cardId: { $in: ids } });

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

    const entities = await EntityOld.find({ cardId: id, version: { $in: [lvm, rvm] } }).sort({ version: 1 });

    if (entities.length !== 2) {
        ctx.status = 400;
        return;
    }

    ctx.body = compare(entities[0].toJSON(), entities[1].toJSON()) ?? {};
});

export default router;
