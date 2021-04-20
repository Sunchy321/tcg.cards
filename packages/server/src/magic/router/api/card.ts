/* eslint-disable @typescript-eslint/no-explicit-any */
import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Card, { ICard } from '@/magic/db/card';
import Set from '@/magic/db/set';
import { Searcher } from '@/search';

import { omit, omitBy, random, uniq } from 'lodash';

import model from '@/magic/search';
import { auxSetType } from '@data/magic/special';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/card');

function find(id: string, lang?: string, set?: string, number?: string): Promise<ICard[]> {
    const aggregate = Card.aggregate().allowDiskUse(true);

    aggregate.match(omitBy({ cardId: id, setId: set, number }, v => v == null));

    if (lang != null) {
        aggregate.addFields({ langIsLocale: { $eq: ['$lang', lang] } });
    }

    aggregate
        .addFields({ langIsEnglish: { $eq: ['$lang', 'en'] } })
        .sort({ langIsLocale: -1, langIsEnglish: -1, releaseDate: -1 })
        .limit(1);

    return aggregate as unknown as Promise<ICard[]>;
}

interface IQuickFindResult {
    _id: string,
    name: string[]
}

function quickFind(id: string[], lang?: string): Promise<IQuickFindResult[]> {
    const aggregate = Card.aggregate().allowDiskUse(true);

    aggregate.match({ cardId: { $in: id } });

    if (lang != null) {
        aggregate.addFields({ langIsLocale: { $eq: ['$lang', lang] } });
    }

    aggregate
        .addFields({ langIsEnglish: { $eq: ['$lang', 'en'] } })
        .sort({ langIsLocale: -1, langIsEnglish: -1, releaseDate: -1 })
        .group({
            _id:  '$cardId',
            name: { $first: '$parts.unified.name' },
        });

    return aggregate as unknown as Promise<IQuickFindResult[]>;
}

router.get('/', async ctx => {
    const { id, lang, set, number } = ctx.query;

    const cards = await find(id, lang, set, number);
    const versions = await Card.aggregate()
        .match({ cardId: id })
        .sort({ releaseDate: -1 })
        .project('-_id lang setId number rarity');

    if (cards.length !== 0) {
        const { relatedCards, ...data } = cards[0];
        const result: any = omit(data, ['_id', '__v']);

        result.versions = versions.map(v => ({ ...v, set: v.setId, setId: undefined }));

        const sets = await Set.find({ setId: { $in: uniq(versions.map(v => v.setId)) } });

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

        const relatedCardObjects = await quickFind(
            relatedCards.filter(r => r.version == null).map(r => r.cardId),
            cards[0].lang,
        );

        result.relatedCards = [];

        for (const { relation, cardId, version } of relatedCards) {
            if (version != null) {
                const card = await Card.findOne({
                    cardId,
                    lang:   version.lang,
                    setId:  version.set,
                    number: version.number,
                });

                if (card != null) {
                    result.relatedCards.push({
                        relation,
                        cardId,
                        version,
                        name: card.parts.map(p => p.unified.name).join(' // '),
                    });
                }
            } else {
                const card = relatedCardObjects.find(o => o._id === cardId);

                if (card != null) {
                    result.relatedCards.push({
                        relation,
                        cardId,
                        name: card.name.join(' // '),
                    });
                }
            }
        }

        ctx.body = result;
    } else {
        ctx.status = 404;
    }
});

const searcher = new Searcher(model);

router.get('/random', async ctx => {
    const q = ctx.query.q;

    const cardIds = q != null && q !== ''
        ? (await searcher.search(q, { 'only-id': '' })).result?.cards as string[]
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
        }[]
    }[],

    versions: {
        lang: string;
        set: string;
        number: string;
        rarity: string;
        releaseDate: string;
    }[],
}

router.get('/profile', async ctx => {
    const ids = (ctx.query.id ?? '').split(',');

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
            set:         c.setId,
            number:      c.number,
            rarity:      c.rarity,
            releaseDate: c.releaseDate,
        });
    }

    ctx.body = result;
});

export default router;
