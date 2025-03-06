import KoaRouter from '@koa/router';
import { Context, DefaultState } from 'koa';

import Card from '@/hearthstone/db/card';
import { Card as ICard } from '@interface/hearthstone/card';

import {
    flatten, last, mapValues, omit, random, uniq,
} from 'lodash';

import { toMultiple, toSingle } from '@/common/request-helper';

import { locales } from '@static/hearthstone/basic';

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

    const cards = await Card.find({ cardId: id }).sort({ version: -1 });

    const card = cards.find(e => e.version.includes(version ?? 0)) ?? cards[0];

    const buckets = cards.map(e => e.version);

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

    ctx.body = { ...card.toJSON(), versions };
});

router.get('/random', async ctx => {
    const cardIds = await Card.distinct('cardId');

    ctx.body = cardIds[random(cardIds.length - 1)] ?? '';
});

interface CardProfile {
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

    const fullCards = await Card.find({ cardId: { $in: ids } });

    const result: Record<string, CardProfile> = {};

    for (const id of ids) {
        const cards = fullCards.filter(e => e.cardId === id);

        const buckets = cards.map(e => e.version);

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

        const entity = cards.find(e => e.version.includes(versions[0][0])) ?? cards[0];

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

    const cards = await Card.find({ cardId: id, version: { $in: [lvm, rvm] } }).sort({ version: 1 });

    if (cards.length !== 2) {
        ctx.status = 400;
        return;
    }

    const first = cards[0].toJSON() as ICard;
    const second = cards[1].toJSON() as ICard;

    const existLocale = locales.filter(
        l => first.localization.some(e => e.lang === l) || second.localization.some(e => e.lang === l),
    );

    const compareLocalization = existLocale.map(l => {
        const firstLoc = first.localization.find(e => e.lang === l);
        const secondLoc = second.localization.find(e => e.lang === l);

        if (firstLoc == null || secondLoc == null) {
            return [firstLoc, secondLoc];
        } else {
            return compare(firstLoc, secondLoc);
        }
    });

    ctx.body = {
        ...compare(omit(first, ['localization']), omit(second, ['localization'])) ?? {},
        localization: compareLocalization,
    };
});

export default router;
