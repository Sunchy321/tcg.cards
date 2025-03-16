/* eslint-disable @typescript-eslint/no-explicit-any */
import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Card from '@/lorcana/db/card';
import Print from '@/lorcana/db/print';

import { Card as ICard } from '@interface/lorcana/card';
import { Print as IPrint } from '@interface/lorcana/print';

import { CardPrintView } from '@common/model/lorcana/card';

import { mapValues, omitBy, random } from 'lodash';
import { toSingle, toMultiple } from '@/common/request-helper';

// import sorter from '@common/util/sorter';

// import searcher from '@/lorcana/search';

import Parser from '@searcher/parser';

import { locales } from '@static/lorcana/basic';

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
    const { id } = mapValues(ctx.query, toSingle);

    if (id == null) {
        ctx.status = 400;
        return;
    }

    const card = await Card.findOne({ cardId: id });

    if (card == null) {
        ctx.status = 404;
        return;
    }

    ctx.body = card.toJSON();
});

router.get('/random', async ctx => {
    const q = toSingle(ctx.query.q ?? '');

    const cardIds = q !== ''
        ? []
        // ? (await searcher.search('searchId', q)).result ?? []
        : await Card.distinct('cardId');

    ctx.body = cardIds[random(cardIds.length - 1)] ?? '';
});

router.get('/print-view', async ctx => {
    const {
        id, lang, set, number,
    } = mapValues(ctx.query, toSingle);

    if (id == null) {
        ctx.status = 400;
        return;
    }

    const aggregate = Print.aggregate<IPrint & { cards: ICard[] }>()
        .allowDiskUse(true)
        .match(omitBy({
            cardId: id,
            set,
            number,
        }, v => v == null));

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
        .lookup({
            from:         'cards',
            localField:   'cardId',
            foreignField: 'cardId',
            as:           'cards',
        })
        .project({
            '_id':                0,
            '__v':                0,
            'parts.__costMap':    0,
            'langIsLocale':       0,
            'langIsEnglish':      0,
            'scryfall.imageUris': 0,
        });

    const prints = await aggregate;

    if (prints.length === 0) {
        ctx.body = 404;
        return;
    }

    const print = prints[0];

    if (print.cards.length === 0) {
        ctx.body = 404;
        return;
    }

    const card = print.cards[0];

    const versions = await Print.aggregate<Version>()
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

        return locales.indexOf(a.lang) - locales.indexOf(b.lang);
    });

    const result: CardPrintView = {
        cardId: card.cardId,

        lang:   print.lang,
        set:    print.set,
        number: print.number,

        cost:  card.cost,
        color: card.color,

        inkwell: card.inkwell,

        name:     card.name,
        typeline: card.typeline,
        text:     card.text,

        localization: card.localization,

        printName:     print.name,
        printTypeline: print.typeline,
        printText:     print.text,

        type: card.type,

        lore:      card.lore,
        strength:  card.strength,
        willPower: card.willPower,
        moveCost:  card.moveCost,

        flavorText: print.flavorText,
        artist:     print.artist,

        imageUri: print.imageUri,

        tags:      card.tags,
        printTags: print.tags,

        layout:      print.layout,
        rarity:      print.rarity,
        releaseDate: print.releaseDate,
        finishes:    print.finishes,

        id:           print.id,
        code:         print.code,
        tcgPlayerId:  print.tcgPlayerId,
        cardMarketId: print.cardMarketId,
        cardTraderId: print.cardTraderId,

        versions,
    };

    ctx.body = result;
});

interface CardProfile {
    cardId: string;

    localization: {
        lang: string;
        name: string;
    }[];

    versions: {
        lang: string;
        set: string;
        number: string;
        rarity: string;
    }[];
}

router.get('/profile', async ctx => {
    const ids = toMultiple(ctx.query.ids ?? '');

    if (ids.length === 0) {
        ctx.status = 400;
        return;
    }

    const cards = await Card.aggregate<ICard & { prints: IPrint[] }>()
        .match({ cardId: { $in: ids } })
        .lookup({
            from:         'prints',
            localField:   'cardId',
            foreignField: 'cardId',
            as:           'prints',
        });

    const result: Record<string, CardProfile> = {};

    for (const c of cards) {
        if (result[c.cardId] == null) {
            result[c.cardId] = {
                cardId:       c.cardId,
                localization: c.localization,
                versions:     [],
            };
        }

        const profile = result[c.cardId];

        for (const p of c.prints) {
            profile.versions.push({
                set:    p.set,
                number: p.number,
                lang:   p.lang,
                rarity: p.rarity,
            });
        }
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
