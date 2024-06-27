/* eslint-disable @typescript-eslint/no-explicit-any */
import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import { Aggregate, ObjectId } from 'mongoose';

import Card from '@/magic/db/card';
import Format from '@/magic/db/format';

import { Card as ICard } from '@interface/magic/card';

import { omit, mapValues } from 'lodash';
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
    const { id: cardId } = mapValues(ctx.query, toSingle);

    const card = await Card.findOne({ cardId });

    if (card != null) {
        ctx.body = card.toObject();
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

export default router;
