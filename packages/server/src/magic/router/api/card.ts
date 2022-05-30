/* eslint-disable @typescript-eslint/no-explicit-any */
import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Card from '@/magic/db/card';

import { Card as ICard } from '@interface/magic/card';

import {
    mapValues, omitBy, random,
} from 'lodash';
import { toSingle, toMultiple } from '@/common/request-helper';
import { force } from '@/magic/util';

import searcher from '@/magic/search';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/card');

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
            '_id':                0,
            '__v':                0,
            'parts.__costMap':    0,
            'langIsLocale':       0,
            'langIsEnglish':      0,
            'frameEffectCount':   0,
            'scryfall.imageUris': 0,
        });

    const cards: ICard[] = await aggregate;

    const versions = await Card.aggregate<Version>()
        .match({ cardId: id })
        .sort({ releaseDate: -1 })
        .project('-_id lang set number rarity');

    if (cards.length !== 0) {
        const c = cards[0];

        ctx.body = force<ICard & { versions: Version[] }>({
            cardId: c.cardId,

            lang:   c.lang,
            set:    c.set,
            number: c.number,

            manaValue:     c.manaValue,
            colorIdentity: c.colorIdentity,

            parts: c.parts.map(p => ({
                cost:           p.cost,
                color:          p.color,
                colorIndicator: p.colorIndicator,

                typeSuper: p.typeSuper,
                typeMain:  p.typeMain,
                typeSub:   p.typeSub,

                power:        p.power,
                toughness:    p.toughness,
                loyalty:      p.loyalty,
                handModifier: p.handModifier,
                lifeModifier: p.lifeModifier,

                oracle: {
                    name:     p.oracle.name,
                    typeline: p.oracle.typeline,
                    text:     p.oracle.text,
                },

                unified: {
                    name:     p.unified.name,
                    typeline: p.unified.typeline,
                    text:     p.unified.text,
                },

                printed: {
                    name:     p.printed.name,
                    typeline: p.printed.typeline,
                    text:     p.printed.text,
                },

                scryfallIllusId: p.scryfallIllusId,
                flavorName:      p.flavorName,
                flavorText:      p.flavorText,
                artist:          p.artist,
                watermark:       p.watermark,
            })),

            versions: versions.map(v => ({
                lang:   v.lang,
                set:    v.set,
                number: v.number,
                rarity: v.rarity,
            })),

            relatedCards: c.relatedCards.map(r => ({
                relation: r.relation,
                cardId:   r.cardId,
                version:  r.version,
            })),

            rulings: c.rulings.map(r => ({
                source: r.source,
                date:   r.date,
                text:   r.text,
                cards:  r.cards,
            })),

            keywords:       c.keywords,
            counters:       c.counters,
            producibleMana: c.producibleMana,
            tags:           c.tags,
            localTags:      c.localTags,

            category:     c.category,
            layout:       c.layout,
            frame:        c.frame,
            frameEffects: c.frameEffects,
            borderColor:  c.borderColor,
            cardBack:     c.cardBack,
            promoTypes:   c.promoTypes,
            rarity:       c.rarity,
            releaseDate:  c.releaseDate,

            isDigital:        c.isDigital,
            isFullArt:        c.isFullArt,
            isOversized:      c.isOversized,
            isPromo:          c.isPromo,
            isReprint:        c.isReprint,
            isStorySpotlight: c.isStorySpotlight,
            isTextless:       c.isTextless,
            finishes:         c.finishes,
            hasHighResImage:  c.hasHighResImage,
            imageStatus:      c.imageStatus,

            legalities:     c.legalities,
            isReserved:     c.isReserved,
            inBooster:      c.inBooster,
            contentWarning: c.contentWarning,
            games:          c.games,

            preview: c.preview,

            scryfall: c.scryfall,

            arenaId:      c.arenaId,
            mtgoId:       c.mtgoId,
            mtgoFoilId:   c.mtgoFoilId,
            multiverseId: c.multiverseId,
            tcgPlayerId:  c.tcgPlayerId,
            cardMarketId: c.cardMarketId,
        });
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

export default router;
