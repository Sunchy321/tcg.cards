import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import { ObjectId } from 'mongoose';

import Card from '@/yugioh/db/card';
import Print from '@/yugioh/db/print';
import CardRelation from '@/yugioh/db/card-relation';

import { Card as ICard } from '@interface/yugioh/card';
import {
    ICardDatabase,
    CardEditorView, CardUpdationCollection, CardUpdationView,
    RelatedCard,
} from '@common/model/yugioh/card';
import { Updation } from '@common/model/updation';

import { omit, mapValues, isEqual } from 'lodash';
import { toSingle } from '@/common/request-helper';

import searcher from '@/yugioh/search';
import * as logger from '@/yugioh/logger';

// import { formats as formatList } from '@static/yugioh/basic';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/card');

router.get('/raw', async ctx => {
    const {
        id: cardId, lang, set, number,
    } = mapValues(ctx.query, toSingle);

    const card = await Card.findOne({ cardId });

    const print = await Print.findOne({
        cardId, lang, set, number,
    });

    const sourceRelations = await CardRelation.find({ sourceId: cardId });

    const relatedCards: RelatedCard[] = sourceRelations.map(s => ({
        relation: s.relation,
        cardId:   s.targetId,
    }));

    if (card != null && print != null) {
        ctx.body = {
            card:  card.toObject(),
            print: print.toObject(),
            relatedCards,
        } as CardEditorView;
    } else {
        ctx.status = 404;
    }
});

router.get('/search', async ctx => {
    const { q, sample: sampleText, 'filter-by': filterBy } = mapValues(ctx.query, toSingle);

    if (q == null) {
        ctx.status = 400;
        return;
    }

    const sample = Number.isNaN(Number.parseInt(sampleText, 10))
        ? 100
        : Number.parseInt(sampleText, 10);

    const result = await searcher.search('dev', q, {
        sample: ['card', 'lang'].includes(filterBy) ? sample * 2 : sample,
    });

    const cards = ((values: { card: { cardId: string }, print: { lang: string } }[]) => {
        switch (filterBy) {
        case 'card':
            return values.filter((v, i, a) => a
                .slice(i + 1)
                .every(e => e.card.cardId !== v.card.cardId));
        case 'lang':
            return values.filter((v, i, a) => a
                .slice(i + 1)
                .every(e => e.card.cardId !== v.card.cardId || e.print.lang !== v.print.lang));
        default:
            return values;
        }
    })(result.result?.cards ?? []);

    ctx.body = {
        method: `search:${q}`,
        cards,
        total:  result.result?.total ?? 0,
    };
});

router.post('/update', async ctx => {
    const { data } = ctx.request.body as { data: ICard & { _id: ObjectId } };

    const old = await Card.findById(data._id);

    if (old != null) {
        await old.replaceOne(data);
    } else {
        await Card.create(omit(data, ['_id', '__v']) as ICard);
    }

    ctx.status = 200;
});

router.post('/update-related', async ctx => {
    const { id, related } = ctx.request.body as { id: string, related: RelatedCard[] };

    if (id == null) {
        return;
    }

    await CardRelation.deleteMany({ sourceId: id });

    for (const r of related) {
        const card = await Card.findOne({ cardId: r.cardId });

        if (card == null) {
            continue;
        }

        await CardRelation.create({
            relation: r.relation,
            sourceId: id,
            targetId: r.cardId,
        });
    }

    ctx.status = 200;
});

router.get('/get-updation', async ctx => {
    const keys = await Card.aggregate<{ _id: string, count: number }>()
        .unwind('__updations')
        .group({
            _id:   '$__updations.key',
            count: { $sum: 1 },
        })
        .sort({ count: 1 });

    if (keys.length === 0) {
        ctx.body = {
            total:   0,
            key:     '',
            current: 0,
            values:  [],
        } as CardUpdationCollection;
        return;
    }

    const minimumKey = keys[0]._id;
    const current = keys[0].count;
    const total = keys.reduce((acc, cur) => acc + cur.count, 0);

    const updations = await Card.aggregate<CardUpdationView>()
        .match({ '__updations.key': minimumKey })
        .unwind('__updations')
        .match({ '__updations.key': minimumKey })
        .project({
            _id:        '$_id',
            cardId:     '$cardId',
            scryfallId: '$scryfall.oracleId',

            key:      '$__updations.key',
            oldValue: '$__updations.oldValue',
            newValue: '$__updations.newValue',
        });

    ctx.body = {
        total,
        key:    minimumKey,
        current,
        values: updations,
    } as CardUpdationCollection;
});

function access(card: ICardDatabase, key: string) {
    const keyParts = (`.${key}`).split(/(\.[a-z_]+|\[[^]]+\])/i).filter(v => v !== '');

    let object: any = card;

    for (const part of keyParts) {
        let m;

        if (part.startsWith('.')) {
            object = object[part.slice(1)];
        } else if ((m = /^\[(.*)\]$/.exec(part)) != null) {
            const index = m[1];

            if (/^\d+$/.test(index)) {
                object = object[Number.parseInt(index, 10)];
            } else {
                object = object.find((v: any) => v.lang === index);
            }
        } else {
            console.error(`unknown key ${key}`);
            return undefined;
        }
    }

    return object;
}

function rejectUpdation(card: ICardDatabase, updation: Updation) {
    const { key } = updation;

    const keyParts = (`.${key}`).split(/(\.[a-z_]+|\[[^]]+\])/i).filter(v => v !== '');

    let object: any = card;

    for (const [i, part] of keyParts.entries()) {
        let m;

        const isLast = i === keyParts.length - 1;

        if (part.startsWith('.')) {
            if (isLast) {
                object[part.slice(1)] = updation.oldValue;
            } else {
                object = object[part.slice(1)];
            }
        } else if ((m = /^\[(.*)\]$/.exec(part)) != null) {
            const index = m[1];

            if (/^\d+$/.test(index)) {
                if (isLast) {
                    object[Number.parseInt(index, 10)] = updation.oldValue;
                } else {
                    object = object[Number.parseInt(index, 10)];
                }
            } else {
                if (isLast) {
                    const itemIndex = object.findIndex((v: any) => v.lang === index);

                    object.splice(itemIndex, 1);
                } else {
                    object = object.find((v: any) => v.lang === index);
                }
            }
        } else {
            console.error(`unknown key ${key}`);
            return;
        }
    }

    card.__lockedPaths.push(key);
}

router.post('/commit-updation', async ctx => {
    const {
        id, key, type,
    } = ctx.request.body as {
        id: string; key: string; type: string;
    };

    const card = await Card.findOne({ _id: id });

    if (card == null) {
        ctx.status = 200;
        return;
    }

    const updation = card.__updations.find(u => u.key === key);

    if (updation == null) {
        ctx.status = 200;
        return;
    }

    card.__updations = card.__updations.filter(u => u.key !== key);

    if (type === 'reject') {
        rejectUpdation(card, updation);
    }

    await card.save();

    logger.updation.info(`commit-updation(card), id=${id}(${card.cardId}), key=${key}, type=${type}`);

    ctx.status = 200;
});

router.post('/accept-all-updation', async ctx => {
    const { key } = ctx.request.body as { key: string };

    const cards = await Card.find({ '__updations.key': key });

    for (const c of cards) {
        c.__updations = c.__updations.filter(u => u.key !== key);

        await c.save();
    }

    ctx.status = 200;
});

router.post('/reject-all-updation', async ctx => {
    const { key } = ctx.request.body as { key: string };

    const cards = await Card.find({ '__updations.key': key });

    for (const c of cards) {
        const updation = c.__updations.filter(u => u.key === key);

        if (updation.length !== 1) {
            continue;
        }

        c.__updations = c.__updations.filter(u => u.key !== key);
        rejectUpdation(c, updation[0]);
        await c.save();
    }

    ctx.status = 200;
});

router.post('/accept-unchanged', async ctx => {
    const { key } = ctx.request.body as { key: string };

    const cards = await Card.find({ '__updations.key': key });

    for (const c of cards) {
        const updations = c.__updations.filter(u => u.key === key);

        const currentValue = access(c, key);
        const originalValue = updations[0].oldValue;

        if (isEqual(currentValue, originalValue) || (currentValue == null && originalValue == null)) {
            c.__updations = c.__updations.filter(u => u.key !== key);
            await c.save();
        }
    }

    ctx.status = 200;
});

export default router;
