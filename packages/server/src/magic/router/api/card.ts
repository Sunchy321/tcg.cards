/* eslint-disable @typescript-eslint/no-explicit-any */
import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Card from '@/magic/db/card-temp';

import { Card as ICard } from '@interface/magic/card-temp';

import {
    mapValues, omitBy, random,
} from 'lodash';
import { toSingle, toMultiple } from '@/common/request-helper';
// import sortKey from '@/common/sort-key';

import searcher from '@/magic/search';

import Parser from '@searcher/parser';

import { extendedLocales } from '@static/magic/basic';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/card');

type Version = {
    lang: string;
    set: string;
    number: string;
    rarity: string;
    releaseDate: string;
};

router.get('/', async ctx => {
    const {
        id, lang, set, number,
    } = mapValues(ctx.query, toSingle);

    if (id == null) {
        ctx.status = 400;
        return;
    }

    const aggregate = Card.aggregate().allowDiskUse(true);

    aggregate.match(omitBy({ cardId: id, set, number }, v => v == null));

    if (lang != null) {
        aggregate.addFields({ langIsLocale: { $eq: ['$lang', lang] } });
    }

    aggregate
        .addFields({
            langIsEnglish: { $eq: ['$lang', 'en'] },
        })
        .sort({
            langIsLocale: -1, langIsEnglish: -1, releaseDate: -1, number: 1,
        })
        .collation({ locale: 'en', numericOrdering: true })
        .limit(1)
        .project({
            '_id':                0,
            '__v':                0,
            'parts.__costMap':    0,
            'langIsLocale':       0,
            'langIsEnglish':      0,
            'scryfall.imageUris': 0,
        });

    const cards: ICard[] = await aggregate;

    const versions = await Card.aggregate<Version>()
        .match({ cardId: id })
        .sort({ releaseDate: -1 })
        .project({
            _id:         0,
            lang:        1,
            set:         1,
            number:      1,
            rarity:      1,
            releaseDate: 1,
        });

    versions.sort((a, b) => {
        const ra = a.releaseDate;
        const rb = b.releaseDate;

        if (ra < rb) { return 1; }

        if (ra > rb) { return -1; }

        const ma = /^(.*?)(?:-\d|[ab])?$/.exec(a.number)![1];
        const mb = /^(.*?)(?:-\d|[ab])?$/.exec(b.number)![1];

        const len = Math.max(ma.length, mb.length);

        const pa = ma.padStart(len, '0');
        const pb = mb.padStart(len, '0');

        if (pa < pb) { return -1; }
        if (pa > pb) { return 1; }

        return extendedLocales.indexOf(a.lang) - extendedLocales.indexOf(b.lang);
    });

    if (cards.length !== 0) {
        ctx.body = JSON.stringify(
            // sortKey<ICard & { versions: Version[] }>({ ...cards[0], versions }),
            { ...cards[0], versions },
            null,
            2,
        );
    } else {
        ctx.status = 404;
    }
});

router.get('/random', async ctx => {
    const q = toSingle(ctx.query.q ?? '');

    const cardIds = q !== ''
        ? (await searcher.search('searchId', q)).result ?? []
        : await Card.distinct('cardId');

    ctx.body = cardIds[random(cardIds.length - 1)] ?? '';
});

interface CardProfile {
    cardId: string;

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
        layout: string;
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
            layout:      c.layout,
            releaseDate: c.releaseDate,
        });
    }

    ctx.body = result;
});

router.get('/test', async ctx => {
    const text = ctx.query.text as string ?? '';

    const parser = new Parser(text);

    try {
        const expr = parser.parse();

        ctx.body = expr;
    } catch (e: any) {
        ctx.body = {
            text,
            type:     e.type,
            value:    e.value,
            location: e.location,
            tokens:   parser.tokens,
        };
    }
});

export default router;
