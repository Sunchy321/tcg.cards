/* eslint-disable @typescript-eslint/no-explicit-any */
import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Card, { ICard } from '@/magic/db/card';
import Format from '@/magic/db/format';
import CardUpdation, { ICardUpdation } from '@/magic/db/card-updation';

import { Aggregate, ObjectId, UpdateQuery } from 'mongoose';

import CardNameExtractor from '@/magic/extract-name';

import { existsSync, renameSync } from 'fs';
import {
    omit, mapValues, isEqual, sortBy,
} from 'lodash';
import websocket from '@/middlewares/websocket';
import { toSingle } from '@/common/request-helper';
import internalData from '@/internal-data';

import { SpellingMistakes } from '@/magic/scryfall/data/ruling';
import { CardData, getLegality, getLegalityRules } from '@/magic/banlist/legality';
import parseGatherer, { GathererGetter } from '@/magic/gatherer/parse';

import searcher from '@/magic/search';

import { assetPath } from '@/config';
import { formats as formatList } from '@static/magic/basic';
import { textWithParen } from '@static/magic/special';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/card');

router.get('/raw', async ctx => {
    const {
        id: cardId, lang, set, number,
    } = mapValues(ctx.query, toSingle);

    const card = await Card.findOne({
        cardId, lang, set, number,
    });

    if (card != null) {
        ctx.body = card.toObject();
    } else {
        ctx.status = 404;
    }
});

router.get('/search', async ctx => {
    const { q, sample } = mapValues(ctx.query, toSingle);

    if (q == null) {
        ctx.status = 400;
        return;
    }

    const result = await searcher.dev(q, { sample });

    ctx.body = {
        method: `search:${q}`,
        ...result.result,
    };
});

router.post('/update', async ctx => {
    const { data } = ctx.request.body as { data: ICard & { _id: ObjectId } };

    for (const p of data.parts) {
        if (p.flavorText === '') {
            delete p.flavorText;
        }
    }

    if (data.counters?.length === 0) {
        delete data.counters;
    }

    const old = await Card.findById(data._id);

    if (old != null) {
        await old.replaceOne(data);
    } else {
        await Card.create(omit(data, ['_id', '__v']) as ICard);
    }

    if (old == null || (data.cardId === old.cardId && data.lang === old.lang)) {
        const cardUpdate: UpdateQuery<ICard> = { };
        const langUpdate: UpdateQuery<ICard> = { };

        if (cardUpdate.$set == null) { cardUpdate.$set = {}; }
        if (cardUpdate.$unset == null) { cardUpdate.$unset = {}; }
        if (langUpdate.$set == null) { langUpdate.$set = {}; }
        if (langUpdate.$unset == null) { langUpdate.$unset = {}; }

        for (let i = 0; i < data.parts.length; i += 1) {
            const part = data.parts[i];

            cardUpdate.$set[`parts.${i}.oracle`] = part.oracle;
            langUpdate.$set[`parts.${i}.unified`] = part.unified;
        }

        if (data.counters == null || data.counters.length === 0) {
            cardUpdate.$unset.counters = 0;
        } else {
            cardUpdate.$set.counters = data.counters;
        }

        cardUpdate.$set.tags = data.tags;
        langUpdate.$unset.__oracle = 0;

        const versions = await Card.find({ cardId: { $in: data.relatedCards.map(r => r.cardId) } });

        const relatedCards = sortBy(
            data.relatedCards.filter(r => versions.some(v => v.cardId === r.cardId)),
            ['relation', 'cardId'],
        ) as ICard['relatedCards'];

        if (relatedCards.every(r => r.version == null)) {
            cardUpdate.$set.relatedCards = relatedCards;
        }

        for (const r of relatedCards) {
            // don't consider non-token, non-emblem relation
            if (!['token', 'emblem', 'specialization'].includes(r.relation)) {
                continue;
            }

            // already added this entry
            if (old?.relatedCards.some(ro => isEqual(r, ro))) {
                continue;
            }

            const related = await Card.findOne({ cardId: r.cardId });

            // no such token or already added this entry
            if (related == null || related.relatedCards.some(r => r.relation === 'source' && r.cardId === data.cardId)) {
                continue;
            }

            const newRelatedCards = [...related.relatedCards, { relation: 'source', cardId: data.cardId }];

            await Card.updateMany(
                { cardId: r.cardId },
                { relatedCards: sortBy(newRelatedCards, ['relation', 'cardId']) },
            );
        }

        await Card.updateMany({ cardId: data.cardId }, cardUpdate);
        await Card.updateMany({ cardId: data.cardId, lang: data.lang }, langUpdate);
    }

    ctx.status = 200;
});

interface INeedEditResult {
    _id: { id: string, lang: string, part: number };
}

type AggregateOption = {
    lang?: string;
    match?: any;
    post?: (arg: Aggregate<any[]>) => Aggregate<any[]>;
};

function aggregate({ lang, match, post }: AggregateOption): Aggregate<INeedEditResult[]> {
    const agg = Card.aggregate().allowDiskUse(true);

    if (match != null) { agg.match(match); }
    if (lang != null) { agg.match({ lang }); }

    agg
        .unwind({ path: '$parts', includeArrayIndex: 'partIndex' })
        .addFields({ info: { id: '$cardId', lang: '$lang', part: '$partIndex' } });

    if (match != null) { agg.match(match); }

    if (post != null) {
        post(agg);
    } else {
        agg.group({ _id: '$info' });
    }

    return agg;
}

const needEditGetters: Record<string, (lang?: string) => Aggregate<INeedEditResult[]>> = {
    oracle: lang => aggregate({
        post: agg => agg
            .group({
                _id:           '$info',
                colorIdentity: { $addToSet: '$colorIdentity' },
                color:         { $addToSet: '$parts.color' },
                power:         { $addToSet: '$parts.power' },
                toughness:     { $addToSet: '$parts.toughness' },
                name:          { $addToSet: '$parts.oracle.name' },
                typeline:      { $addToSet: '$parts.oracle.typeline' },
                text:          { $addToSet: '$parts.oracle.text' },
                counters:      { $addToSet: '$counters' },
                relatedCards:  { $addToSet: '$relatedCards' },
                __oracle:      { $addToSet: '$__oracle' },
            })
            .match({
                '_id.lang': lang,
                '$or':      [
                    { 'colorIdentity.1': { $exists: true } },
                    { 'color.1': { $exists: true } },
                    { 'power.1': { $exists: true } },
                    { 'toughness.1': { $exists: true } },
                    { 'name.1': { $exists: true } },
                    { 'typeline.1': { $exists: true } },
                    { 'text.1': { $exists: true } },
                    { 'counters.1': { $exists: true } },
                    { 'relatedCards.1': { $exists: true } },
                    { '__oracle.name': { $exists: true } },
                    { '__oracle.typeline': { $exists: true } },
                    { '__oracle.text': { $exists: true } },
                ],
            }),
    }),

    unified: lang => aggregate({
        lang,
        post: agg => agg
            .group({
                _id:      '$info',
                name:     { $addToSet: '$parts.unified.name' },
                typeline: { $addToSet: '$parts.unified.typeline' },
                text:     { $addToSet: '$parts.unified.text' },
                date:     { $max: '$releaseDate' },
            })
            .match({
                $or: [
                    { name: { $not: { $size: 1 } } },
                    { typeline: { $not: { $size: 1 } } },
                    { text: { $not: { $size: 1 } } },
                ],
            }),
    }),

    paren: lang => aggregate({
        lang,
        match: {
            'cardId':             { $nin: textWithParen },
            'parts.unified.text': /[(（].+[)）]/,
            'parts.typeMain':     { $nin: ['dungeon', 'card'] },
            'parts.typeMain.0':   { $exists: true },
        },
    }),

    token: () => aggregate({
        match: {
            'cardId':          { $not: /!/ },
            'parts.typeSuper': 'token',
        },
    }),
};

router.get('/need-edit', async ctx => {
    const { method, lang, sample: sampleText } = mapValues(ctx.query, toSingle);

    const getter = needEditGetters[method];

    const sample = Number.isNaN(Number.parseInt(sampleText, 10))
        ? 100
        : Number.parseInt(sampleText, 10);

    if (getter == null) {
        ctx.status = 400;
        return;
    }

    const total = (await getter(lang)).length;

    if (total === 0) {
        ctx.body = {
            method,
            cards: [],
            total,
        };
        return;
    }

    const result = await getter(lang).sort({ date: -1 }).limit(sample);// .sample(sample);

    const cards = await Card.aggregate().allowDiskUse(true)
        .match({ $or: result.map(r => ({ cardId: r._id.id, lang: r._id.lang })) })
        .sort({ releaseDate: -1 })
        .group({ _id: { id: '$cardId', lang: '$lang' }, card: { $first: '$$ROOT' } });

    const resultCards = result.map(r => {
        const card = cards.find(c => c._id.id === r._id.id && c._id.lang === r._id.lang);

        if (card != null) {
            return { ...card.card, partIndex: r._id.part, result: { method, ...omit(r, 'date') } };
        } else {
            return null;
        }
    }).filter(v => v != null);

    ctx.body = {
        method,
        cards: resultCards,
        total,
    };
});

router.get('/rename', async ctx => {
    const { set } = mapValues(ctx.query, toSingle);

    if (set == null) {
        ctx.status = 404;
        return;
    }

    const cards = await Card.find({ set, lang: 'zhs' });

    const renamed = [];
    const missed = [];

    for (const c of cards) {
        const { name } = c.parts[0].oracle;

        const oldPath = `${assetPath}/magic/card/large/${set}/zhs/${name.replace(':', '')}.full.jpg`;
        const oldPathWithNumber = `${assetPath}/magic/card/large/${set}/zhs/${name.replace(':', '')}.${c.number}.full.jpg`;
        const newPath = `${assetPath}/magic/card/large/${set}/zhs/${c.number}.jpg`;

        if (existsSync(newPath)) {
            continue;
        }

        if (existsSync(oldPath)) {
            renameSync(oldPath, newPath);

            renamed.push(`${name} -> ${c.number}`);
        } else if (existsSync(oldPathWithNumber)) {
            renameSync(oldPathWithNumber, newPath);

            renamed.push(`${name}.${c.number} -> ${c.number}`);
        } else {
            missed.push([c.cardId, c.parts.map(p => p.oracle.name), c.number]);
        }
    }

    ctx.body = { missed, renamed };
});

router.get('/parse-gatherer', async ctx => {
    const {
        id: mid, set, number, lang,
    } = mapValues(ctx.query, toSingle);

    const mids = mid.split(',').map(v => Number.parseInt(v.trim(), 10));

    if (mids.length >= 1 && mids.length <= 2 && mids.every(n => !Number.isNaN(n))) {
        await parseGatherer(mids, set, number, lang);
    }
});

router.get('/get-legality', async ctx => {
    const { id } = mapValues(ctx.query, toSingle);

    if (id == null) {
        ctx.status = 401;
        return;
    }

    const formats = await Format.find();

    formats.sort((a, b) => formatList.indexOf(a.formatId) - formatList.indexOf(b.formatId));

    const rules = getLegalityRules();

    const cardData = await Card.aggregate<CardData>([
        { $match: { cardId: id } },
        {
            $group: {
                _id: '$cardId',

                category:   { $first: '$category' },
                legalities: { $addToSet: '$legalities' },

                parts: {
                    $first: {
                        $map: {
                            input: '$parts',
                            as:    'parts',
                            in:    {
                                typeMain: '$$parts.typeMain',
                                typeSub:  '$$parts.typeSub',
                            },
                        },
                    },
                },

                versions: {
                    $addToSet: {
                        set:           '$set',
                        number:        '$number',
                        rarity:        '$rarity',
                        securityStamp: '$securityStamp',
                        releaseDate:   '$releaseDate',
                    },
                },

                scryfall: {
                    $first: '$scryfall.oracleId',
                },
            },
        },
    ]);

    const legalities = getLegality(cardData[0], formats, rules);

    await Card.updateMany({ cardId: id }, { legalities });

    ctx.body = legalities;
});

router.get('/extract-ruling-cards', async ctx => {
    const cardNames = await CardNameExtractor.names();
    const spellingMistakes = internalData<SpellingMistakes>('magic.rulings.spelling-mistakes');

    const ids = (ctx.query.id ?? '') as string;

    for (const id of ids.split(',')) {
        const card = await Card.findOne({ cardId: id as string });

        if (card == null) {
            continue;
        }

        for (const m of spellingMistakes) {
            if (m.cardId === card.cardId) {
                for (const r of card.rulings) {
                    r.text = r.text.replaceAll(m.text, m.correction);
                }
            }
        }

        const cardsList = [];

        for (const r of card.rulings) {
            const cards = new CardNameExtractor({
                text:     r.text,
                cardNames,
                thisName: { id: card.cardId, name: card.parts.map(p => p.oracle.name) },
            }).extract();

            cardsList.push(cards);

            if (cards.length > 0) {
                r.cards = cards;
            } else {
                r.cards = undefined;
            }
        }

        await Card.updateMany({ cardId: card.cardId }, { rulings: card.rulings });

        ctx.body = cardsList;
    }
});

const gathererGetters: Record<string, GathererGetter> = { };

router.get(
    '/get-gatherer',
    websocket,
    async ctx => {
        const ws = await ctx.ws();

        const { set } = mapValues(ctx.query, toSingle);

        if (set == null) {
            ctx.status = 400;
            ws.close();
        } else {
            if (gathererGetters[set] == null) {
                gathererGetters[set] = new GathererGetter(set);
            }

            gathererGetters[set].on('end', () => delete gathererGetters[set]);
            gathererGetters[set].bind(ws);
        }

        ctx.status = 200;
    },
);

router.get('/get-updation', async ctx => {
    const updationTypes = await CardUpdation.aggregate<{ _id: string, count: number }>()
        .group({ _id: '$key', count: { $sum: 1 } })
        .sort({ count: 1 });

    if (updationTypes.length === 0) {
        ctx.body = {
            total:   0,
            key:     '',
            current: 0,
            values:  [],
        };

        return;
    }

    const key = updationTypes[0]._id;

    const total = await CardUpdation.count();
    const current = await CardUpdation.countDocuments({ key });

    const updation = await CardUpdation.aggregate<ICardUpdation>().match({ key }).sample(50);

    const cards = await Card.find({ 'scryfall.cardId': { $in: updation.map(v => v.scryfallId) } });

    const values = updation.map(u => {
        const c = cards.find(c => c.scryfall.cardId === u.scryfallId);

        if (c == null) {
            return u;
        }

        return {
            ...u,
            set:    c.set,
            number: c.number,
            lang:   c.lang,
        };
    });

    ctx.body = {
        total, key, current, values,
    };
});

router.post('/commit-updation', async ctx => {
    const { id, type } = ctx.request.body;

    const updation = await CardUpdation.findById(id);

    if (updation == null) {
        return;
    }

    if (type === 'decline') {
        const card = await Card.findOne({ 'scryfall.cardId': updation.scryfallId });

        if (card != null) {
            if (updation.key.startsWith('parts.')) {
                (card.parts[updation.partIndex!] as any)[updation.key.slice(5)] = updation.oldValue;
            } else {
                (card as any)[updation.key] = updation.oldValue;
            }

            await card.save();
        }
    }

    await updation.delete();

    ctx.body = 200;
});

router.post('/accept-all-updation', async ctx => {
    const { key } = ctx.request.body;

    await CardUpdation.deleteMany({ key });

    ctx.body = 200;
});

router.get('/get-duplicate', async ctx => {
    const duplicates = await Card.aggregate<{ _id: { set: string, number: string, lang: string } }>()
        .group({
            _id:   { set: '$set', number: '$number', lang: '$lang' },
            count: { $sum: 1 },
        })
        .match({ count: { $gt: 1 } });

    const first = duplicates[0]?._id;

    if (first == null) {
        ctx.body = {
            total:  0,
            values: [],
        };

        return;
    }

    const cards = await Card.find({ set: first.set, number: first.number, lang: first.lang });

    ctx.body = {
        total:  duplicates.length,
        values: cards.map(c => c.toJSON()),
    };
});

router.post('/resolve-duplicate', async ctx => {
    const { data } = ctx.request.body as { data: ICard };

    await Card.deleteMany({ set: data.set, number: data.number, lang: data.lang });

    await Card.insertMany(data);

    ctx.status = 200;
});

export default router;
