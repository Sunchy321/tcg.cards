/* eslint-disable @typescript-eslint/no-explicit-any */
import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Card from '@/magic/db/card';
import Set from '@/magic/db/set';

import { Card as ICard } from '@interface/magic/card';

import {
    mapValues, omit, omitBy, random, uniq,
} from 'lodash';
import { toSingle, toMultiple } from '@/common/request-helper';

import searcher from '@/magic/search';
import { auxSetType } from '@data/magic/special';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/card');

async function find(id: string, lang?: string, set?: string, number?: string): Promise<ICard[]> {
    const aggregate = Card.aggregate().allowDiskUse(true);

    aggregate.match(omitBy({ cardId: id, set, number }, v => v == null));

    if (lang != null) {
        aggregate.addFields({ langIsLocale: { $eq: ['$lang', lang] } });
    }

    aggregate
        .addFields({
            langIsEnglish:    { $eq: ['$lang', 'en'] },
            frameEffectCount: { $size: '$frameEffects' },
        })
        .sort({
            langIsLocale: -1, langIsEnglish: -1, releaseDate: -1, frameEffectCount: 1,
        })
        .limit(1)
        .project({
            '_id':              0,
            'parts.__costMap':  0,
            '__tags':           0,
            'langIsLocale':     0,
            'langIsEnglish':    0,
            'frameEffectCount': 0,
        });

    return aggregate as unknown as Promise<ICard[]>;
}

interface Version {
    lang: string;
    set: string;
    number: string;
    rarity: string;
}

router.get('/', async ctx => {
    const {
        id, lang, set, number,
    } = mapValues(ctx.query, toSingle);

    if (id == null) {
        ctx.status = 400;
        return;
    }

    const cards = await find(id, lang, set, number);
    const versions = await Card.aggregate<Version>()
        .match({ cardId: id })
        .sort({ releaseDate: -1 })
        .project('-_id lang set number rarity');

    if (cards.length !== 0) {
        const { relatedCards, ...data } = cards[0];
        const result: any = omit(data, ['_id', '__v']);

        result.versions = versions;

        const sets = await Set.find({ setId: { $in: uniq(versions.map(v => v.set)) } });

        for (const v of result.versions) {
            const s = sets.find(s => s.setId === v.set);

            if (s == null) {
                continue;
            }

            v.name = Object.fromEntries(s.localization.map(l => [l.lang, l.name]));
            v.symbolStyle = s.symbolStyle;

            if (auxSetType.includes(s.setType)) {
                v.parent = s.parent;
            }
        }

        result.relatedCards = relatedCards;

        ctx.body = result;
    } else {
        ctx.status = 404;
    }
});

router.get('/random', async ctx => {
    const q = toSingle(ctx.query.q ?? '');

    const cardIds = q !== ''
        ? (await searcher.searchId(q)).result ?? []
        : await Card.distinct('cardId');

    ctx.body = cardIds[random(cardIds.length - 1)] ?? '';
});

interface CardProfile {
    cardId: string;

    layout: string;

    parts: {
        localization: {
            lang: string;
            name: string;
        }[];
    }[];

    versions: {
        lang: string;
        set: string;
        number: string;
        rarity: string;
        releaseDate: string;
    }[];
}

router.get('/profile', async ctx => {
    const ids = toMultiple(ctx.query.ids ?? '');

    if (ids.length === 0) {
        ctx.status = 400;
        return;
    }

    const cards = await Card.find({ cardId: { $in: ids } });

    const result: Record<string, CardProfile> = {};

    for (const c of cards) {
        if (result[c.cardId] == null) {
            result[c.cardId] = {
                cardId:   c.cardId,
                layout:   c.layout,
                parts:    [],
                versions: [],
            };
        }

        const profile = result[c.cardId];

        for (const [i, p] of c.parts.entries()) {
            if (profile.parts[i] == null) {
                profile.parts[i] = { localization: [] };
            }

            if (!profile.parts[i].localization.some(l => l.lang === c.lang)) {
                profile.parts[i].localization.push({
                    lang: c.lang,
                    name: p.unified.name,
                });
            }
        }

        profile.versions.push({
            lang:        c.lang,
            set:         c.set,
            number:      c.number,
            rarity:      c.rarity,
            releaseDate: c.releaseDate,
        });
    }

    ctx.body = result;
});

export default router;
