import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Card from '@/ptcg/db/card';
import Print from '@/ptcg/db/print';
import CardRelation from '@/ptcg/db/card-relation';

import { Card as ICard } from '@interface/ptcg/card';
import { Print as IPrint } from '@interface/ptcg/print';

import { CardPrintView, RelatedCard } from '@common/model/ptcg/card';

import { mapValues, omitBy, random } from 'lodash';
import { toSingle, toMultiple } from '@/common/request-helper';

import sorter from '@common/util/sorter';

import search from '@/ptcg/search';

import { locales } from '@static/ptcg/basic';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/card');

type Version = {
    lang:        string;
    set:         string;
    number:      string;
    rarity:      string;
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
        ? (await search.search('searchId', q)).result ?? []
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

    const sourceRelation = await CardRelation.aggregate<RelatedCard>()
        .match({ sourceId: id })
        .project({
            _id:      false,
            relation: '$relation',
            cardId:   '$targetId',
            version:  '$targerVersion',
        });

    sourceRelation.sort(
        sorter.pick<RelatedCard, 'relation'>('relation', sorter.string).or(
            sorter.pick<RelatedCard, 'cardId'>('cardId', sorter.string),
        ),
    );

    const targetRelation = await CardRelation.aggregate<RelatedCard>()
        .match({ targetId: id })
        .project({
            _id:      false,
            relation: 'source',
            cardId:   '$sourceId',
        });

    targetRelation.sort(sorter.pick('cardId', sorter.string));

    const result: CardPrintView = {
        cardId: card.cardId,

        lang:   print.lang,
        set:    print.set,
        number: print.number,

        name: card.name,
        text: card.text,

        localization: card.localization,

        printName: print.name,
        printText: print.text,

        type: card.type,

        category:   card.category,
        legalities: card.legalities,

        flavorText: print.flavorText,
        artist:     print.artist,

        tags:      card.tags,
        printTags: print.tags,

        layout:      print.layout,
        rarity:      print.rarity,
        releaseDate: print.releaseDate,

        imageUrl: print.imageUrl,

        versions,
        relatedCards: [...sourceRelation, ...targetRelation],
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
        lang:        string;
        set:         string;
        number:      string;
        rarity:      string;
        layout:      string;
        releaseDate: string;
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
                set:         p.set,
                number:      p.number,
                lang:        p.lang,
                rarity:      p.rarity,
                layout:      p.layout,
                releaseDate: p.releaseDate,
            });
        }
    }

    ctx.body = result;
});

export default router;
