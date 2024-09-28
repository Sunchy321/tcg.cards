/* eslint-disable @typescript-eslint/no-explicit-any */
import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import { Aggregate, ObjectId } from 'mongoose';

import Card from '@/magic/db/card';
import Print from '@/magic/db/print';
import CardRelation from '@/magic/db/card-relation';
import Format from '@/magic/db/format';

import { Card as ICard } from '@interface/magic/card';
import {
    CardEditorView, CardUpdationCollection, CardUpdationView, RelatedCard,
} from '@common/model/magic/card';
import { Updation, WithUpdation } from '@common/model/updation';

import { omit, mapValues, isEqual } from 'lodash';
import websocket from '@/middlewares/websocket';
import { toSingle } from '@/common/request-helper';
import internalData from '@/internal-data';

import {
    CardLegalityView, LegalityRecorder, getLegality, getLegalityRules, lookupPrintsForLegality,
} from '@/magic/banlist/legality';
import parseGatherer, { GathererGetter, saveGathererImage } from '@/magic/gatherer/parse';

import searcher from '@/magic/search';

import { formats as formatList } from '@static/magic/basic';
import { parenRegex, commaRegex } from '@static/magic/special';

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
    const targetRelations = await CardRelation.find({ targetId: cardId });

    const relatedCards: RelatedCard[] = [
        ...sourceRelations.map(s => ({
            relation: `${s.relation}:src`,
            cardId:   s.targetId,
        })),
        ...targetRelations.map(t => ({
            relation: `${t.relation}:tgt`,
            cardId:   t.sourceId,
        })),
    ];

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

    const cards = ((values: { cardId: string, lang: string }[]) => {
        switch (filterBy) {
        case 'card':
            return values.filter((v, i, a) => a.slice(i + 1).every(e => e.cardId !== v.cardId));
        case 'lang':
            return values.filter((v, i, a) => a.slice(i + 1).every(e => e.cardId !== v.cardId || e.lang !== v.lang));
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

    if (data.counters?.length === 0) {
        delete data.counters;
    }

    const old = await Card.findById(data._id);

    if (old != null) {
        await old.replaceOne(data);
    } else {
        await Card.create(omit(data, ['_id', '__v']) as ICard);
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
        agg.group({ _id: '$info', date: { $max: '$releaseDate' } });
    }

    return agg;
}

const needEditGetters: Record<string, (lang?: string) => Aggregate<INeedEditResult[]>> = {
    oracle: () => aggregate({
        post: agg => agg
            .match({
                '__updations.key': { $in: ['parts.name', 'parts.typeline', 'parts.text'] },
            }),
    }),

    paren: lang => aggregate({
        lang,
        match: {
            'cardId':             { $nin: internalData<string[]>('magic.special.with-paren') },
            'parts.unified.text': parenRegex,
            'parts.typeMain':     { $nin: ['dungeon', 'card'] },
            'parts.typeMain.0':   { $exists: true },
        },
    }),

    keyword: lang => aggregate({
        lang,
        match: {
            'cardId':             { $nin: internalData<string[]>('magic.special.with-comma') },
            'parts.unified.text': commaRegex,
            'parts.typeMain':     { $nin: ['dungeon', 'stickers', 'card'] },
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

    const result = await getter(lang)
        .sort(
            method === 'unified'
                ? { 'unifiedIndicator': -1, 'date': -1, '_id.id': 1 }
                : { 'date': -1, '_id.id': 1 },
        )
        .limit(sample);

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

router.get('/parse-gatherer', async ctx => {
    const {
        id: mid, set, number, lang,
    } = mapValues(ctx.query, toSingle);

    const mids = mid.split(',').map(v => Number.parseInt(v.trim(), 10));

    if (mids.length >= 1 && mids.length <= 2 && mids.every(n => !Number.isNaN(n))) {
        await parseGatherer(mids, set, number, lang);
    }
});

router.get('/save-gatherer-image', async ctx => {
    const {
        id: mid, set, number, lang,
    } = mapValues(ctx.query, toSingle);

    const mids = mid.split(',').map(v => Number.parseInt(v.trim(), 10));

    if (mids.length >= 1 && mids.length <= 2 && mids.every(n => !Number.isNaN(n))) {
        await saveGathererImage(mids, set, number, lang);
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

    const agg = Card.aggregate<CardLegalityView>()
        .match({ cardId: id });

    lookupPrintsForLegality(agg);

    const cardData = await agg;

    const recorder: LegalityRecorder = { };

    const legalities = getLegality(cardData[0], formats, rules, recorder);

    await Card.updateMany({ cardId: id }, { legalities });

    ctx.body = recorder;
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

function access(card: WithUpdation<ICard>, key: string) {
    const keyParts = (`.${key}`).split(/(\.[a-z_]+|\[[^]]+\])/i).filter(v => v !== '');

    let object: any = card;

    for (const part of keyParts) {
        let m;

        if (part.startsWith('.')) {
            object = object[part.slice(1)];
            // eslint-disable-next-line no-cond-assign
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

function rejectUpdation(card: WithUpdation<ICard>, updation: Updation) {
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
            // eslint-disable-next-line no-cond-assign
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

    ctx.status = 200;
});

router.post('/accept-all-updation', async ctx => {
    const { key } = ctx.request.body as { key: string };

    const card = await Card.find({ '__updations.key': key });

    for (const c of card) {
        c.__updations = c.__updations.filter(u => u.key !== key);

        if (key === 'parts[0].text' && !c.tags.includes('dev:oracle')) {
            c.tags.push('dev:oracle');
        }

        await c.save();
    }

    ctx.status = 200;
});

router.post('/reject-all-updation', async ctx => {
    const { key } = ctx.request.body as { key: string };

    const card = await Card.find({ '__updations.key': key });

    for (const c of card) {
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
