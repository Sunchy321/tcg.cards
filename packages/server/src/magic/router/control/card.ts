/* eslint-disable @typescript-eslint/no-explicit-any */
import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Card, { ICard } from '@/magic/db/card';

import { CardNameExtractor } from '@/magic/scryfall/data/ruling';

import { Aggregate, ObjectId } from 'mongoose';

import parseGatherer from '@/magic/gatherer/parse';

import {
    omit, omitBy, mapValues, isEqual, sortBy,
} from 'lodash';
import { toSingle } from '@/common/request-helper';
import { textWithParen } from '@data/magic/special';

import searcher from '@/magic/search';

import { assetPath } from '@static';
import { existsSync, renameSync } from 'fs';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/card');

async function find(id: string, lang?: string, set?: string, number?: string): Promise<ICard[]> {
    const agg = Card.aggregate().allowDiskUse(true);

    agg.match(omitBy({ cardId: id, set, number }, v => v == null));

    if (lang != null) {
        agg.addFields({ langIsLocale: { $eq: ['$lang', lang] } });
    }

    agg
        .addFields({ langIsEnglish: { $eq: ['$lang', 'en'] } })
        .sort({ langIsLocale: -1, langIsEnglish: -1, releaseDate: -1 })
        .limit(1);

    return agg as unknown as Promise<ICard[]>;
}

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
    const { q } = mapValues(ctx.query, toSingle);

    if (q == null) {
        ctx.status = 400;
        return;
    }

    ctx.body = await searcher.dev(q);
});

router.post('/update', async ctx => {
    const { data } = ctx.request.body as { data: ICard & { _id: ObjectId } };

    for (const p of data.parts) {
        if (p.flavorText === '') {
            delete p.flavorText;
        }
    }

    const old = await Card.findById(data._id);

    if (old != null) {
        await old.replaceOne(data);
    } else {
        await Card.create(omit(data, ['_id', '__v']) as ICard);
    }

    if (old == null || (data.cardId === old.cardId && data.lang === old.lang)) {
        for (let i = 0; i < data.parts.length; i += 1) {
            const part = data.parts[i];

            await Card.updateMany(
                { cardId: data.cardId },
                { $set: { [`parts.${i}.oracle`]: part.oracle } },
            );

            await Card.updateMany(
                { cardId: data.cardId, lang: data.lang },
                { $set: { [`parts.${i}.unified`]: part.unified } },
            );
        }

        const versions = await Card.find({ cardId: { $in: data.relatedCards.map(r => r.cardId) } });

        const relatedCards = sortBy(
            data.relatedCards.filter(r => versions.some(v => v.cardId === r.cardId)),
            ['relation', 'cardId'],
        ) as ICard['relatedCards'];

        if (relatedCards.every(r => r.version == null)) {
            await Card.updateMany(
                { cardId: data.cardId },
                { relatedCards },
            );
        }

        for (const r of relatedCards) {
            // don't consider non-token, non-emblem relation
            if (!['token', 'emblem'].includes(r.relation)) {
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

        await Card.updateMany(
            { cardId: data.cardId, lang: data.lang },
            { $unset: { '__tags.oracleUpdated': 1 } },
        );
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

function aggregate({ lang, match, post }: AggregateOption) {
    const agg = Card.aggregate().allowDiskUse(true);

    if (match != null) {
        agg.match(match);
    }

    if (lang != null) {
        agg.match({ lang });
    }

    agg
        .sort({ releaseDate: -1 })
        .unwind({ path: '$parts', includeArrayIndex: 'partIndex' })
        .addFields({ info: { id: '$cardId', lang: '$lang', part: '$partIndex' } });

    if (match != null) {
        agg.match(match);
    }

    if (post != null) {
        post(agg);
    } else {
        agg.group({ _id: '$info' });
    }

    return agg;
}

const needEditGetters: Record<string, (lang?: string) => Promise<INeedEditResult[]>> = {
    'inconsistent-oracle': async lang => aggregate({
        lang,
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
                __tags:        { $first: '$__tags' },
            })
            .match({
                $or: [
                    { 'colorIdentity.2': { $exists: true } },
                    { 'color.2': { $exists: true } },
                    { 'power.2': { $exists: true } },
                    { 'toughness.2': { $exists: true } },
                    { 'name.2': { $exists: true } },
                    { 'typeline.2': { $exists: true } },
                    { 'text.2': { $exists: true } },
                    { '__tags.oracleUpdated.name': { $exists: true } },
                    { '__tags.oracleUpdated.typeline': { $exists: true } },
                    { '__tags.oracleUpdated.text': { $exists: true } },
                ],
            }),
    }),

    'inconsistent-unified': async lang => aggregate({
        lang,
        post: agg => agg
            .group({
                _id:      '$info',
                name:     { $addToSet: '$parts.unified.name' },
                typeline: { $addToSet: '$parts.unified.typeline' },
                text:     { $addToSet: '$parts.unified.text' },
            })
            .match({
                $or: [
                    { name: { $not: { $size: 1 } } },
                    { typeline: { $not: { $size: 1 } } },
                    { text: { $not: { $size: 1 } } },
                ],
            }),
    }),

    'parentheses': async lang => aggregate({
        lang,
        match: {
            'cardId':             { $nin: textWithParen },
            'parts.unified.text': /[(（].+[)）]/,
            'parts.typeMain':     { $nin: ['dungeon', 'card'] },
            'parts.typeMain.0':   { $exists: true },
        },
    }),

    'token': async () => aggregate({
        match: {
            'cardId':          { $not: /!/ },
            'parts.typeSuper': 'token',
        },
    }),
};

router.get('/need-edit', async ctx => {
    const { type, lang } = mapValues(ctx.query, toSingle);

    const getter = needEditGetters[type];

    if (getter == null) {
        ctx.status = 400;
        return;
    }

    const result = await getter(lang);

    if (result.length > 0) {
        const cards = await find(result[0]._id.id, lang);

        if (cards.length > 0) {
            ctx.body = {
                ...cards[0],
                partIndex: result[0]._id.part,
                total:     result.length,
                result:    result[0],
            };
        } else {
            ctx.body = null;
        }
    } else {
        ctx.body = null;
    }
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
    const mid = ctx.query.id as string;
    const set = ctx.query.set as string;
    const number = ctx.query.number as string;
    const lang = ctx.query.lang as string;

    const mids = mid.split(',').map(v => Number.parseInt(v.trim(), 10));

    if (mids.length >= 1 && mids.length <= 2 && mids.every(n => !Number.isNaN(n))) {
        await parseGatherer(mids, set, number, lang);
    }
});

router.get('/extract-ruling-cards', async ctx => {
    const cardNames = await Card.aggregate([
        { $match: { category: 'default' } },
        { $group: { _id: '$cardId', name: { $first: '$parts.oracle.name' } } },
        { $project: { id: '$_id', name: 1 } },
    ]) as { id: string, name: string[] }[];

    const card = await Card.findOne({ cardId: ctx.query.id as string });

    if (card != null) {
        const cardsList = [];

        for (const r of card.rulings) {
            const cards = new CardNameExtractor(r.text, {
                id: card.cardId, name: card.parts.map(p => p.oracle.name),
            }, cardNames).extract();

            cardsList.push(cards);

            r.cards = cards;
        }

        await Card.updateMany({ cardId: card.cardId }, { rulings: card.rulings });

        ctx.body = cardsList;
    }
});

export default router;
