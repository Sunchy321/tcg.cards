import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Card from '@/magic/db/card';
import Print from '@/magic/db/print';
import Ruling from '@/magic/db/ruling';
import CardRelation from '@/magic/db/card-relation';

import { Card as ICard } from '@interface/magic/card';
import { Print as IPrint } from '@interface/magic/print';
import { Ruling as IRuling } from 'card-interface/src/magic/ruling';

import { CardPrintView, RelatedCard } from '@common/model/magic/card';

import {
    mapValues, omitBy, random,
} from 'lodash';
import { toSingle, toMultiple } from '@/common/request-helper';
// import sortKey from '@/common/sort-key';

import sorter from '@common/util/sorter';

import searcher from '@/magic/search';

import Parser from '@searcher/parser';

import { extendedLocales } from '@static/magic/basic';

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
        ? (await searcher.search('searchId', q)).result ?? []
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

        return extendedLocales.indexOf(a.lang) - extendedLocales.indexOf(b.lang);
    });

    const rulings = await Ruling.aggregate<IRuling>()
        .match({ cardId: id })
        .project({ _id: false });

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

        manaValue:     card.manaValue,
        colorIdentity: card.colorIdentity,

        parts: card.parts.map((p, i) => ({
            name:     p.name,
            typeline: p.typeline,
            text:     p.text,

            localization: p.localization,

            printName:     print.parts[i].name,
            printTypeline: print.parts[i].typeline,
            printText:     print.parts[i].text,

            cost:           p.cost,
            manaValue:      p.manaValue,
            color:          p.color,
            colorIndicator: p.colorIndicator,

            type: p.type,

            power:            p.power,
            toughness:        p.toughness,
            loyalty:          p.loyalty,
            defense:          p.defense,
            handModifier:     p.handModifier,
            lifeModifier:     p.lifeModifier,
            attractionLights: print.parts[i].attractionLights,

            scryfallIllusId: print.parts[i].scryfallIllusId,
            flavorName:      print.parts[i].flavorName,
            flavorText:      print.parts[i].flavorText,
            artist:          print.parts[i].artist,
            watermark:       print.parts[i].watermark,
        })),

        keywords:       card.keywords,
        counters:       card.counters,
        producibleMana: card.producibleMana,
        tags:           card.tags,
        printTags:      print.tags,

        category:       card.category,
        legalities:     card.legalities,
        contentWarning: card.contentWarning,

        layout:        print.layout,
        frame:         print.frame,
        frameEffects:  print.frameEffects,
        borderColor:   print.borderColor,
        cardBack:      print.cardBack,
        securityStamp: print.securityStamp,
        promoTypes:    print.promoTypes,
        rarity:        print.rarity,
        releaseDate:   print.releaseDate,

        isDigital:       print.isDigital,
        isPromo:         print.isPromo,
        isReprint:       print.isReprint,
        finishes:        print.finishes,
        hasHighResImage: print.hasHighResImage,
        imageStatus:     print.imageStatus,

        inBooster: print.inBooster,
        games:     print.games,

        preview: print.preview,

        scryfall:     print.scryfall,
        arenaId:      print.arenaId,
        mtgoId:       print.mtgoId,
        mtgoFoilId:   print.mtgoFoilId,
        multiverseId: print.multiverseId,
        tcgPlayerId:  print.tcgPlayerId,
        cardMarketId: print.cardMarketId,

        versions,
        relatedCards: [...sourceRelation, ...targetRelation],
        rulings,
    };

    ctx.body = result;
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
                cardId:   c.cardId,
                parts:    [],
                versions: [],
            };
        }

        const profile = result[c.cardId];

        profile.parts = c.parts.map(p => ({ localization: p.localization }));

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
