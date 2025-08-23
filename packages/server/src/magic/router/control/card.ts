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
import { GathererGetter } from '@/magic/gatherer/parse';

import openai from '@/ai';
import search from '@/magic/search';
import * as logger from '@/magic/logger';

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

    const result = await search.search('dev', q, {
        page: ['card', 'lang'].includes(filterBy) ? sample * 2 : sample,
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

    if (data.counters?.length === 0) {
        delete data.counters;
    }

    const old = await Card.findById(data._id);

    if (old != null) {
        old.overwrite(data);

        await old.save();
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

interface INeedEditResult {
    _id: { id: string, lang: string, part: number };
}

type AggregateOption = {
    lang?: string;
    match: any;
};

function aggregate({ lang, match }: AggregateOption): Aggregate<INeedEditResult[]> {
    const agg = Card.aggregate().allowDiskUse(true);

    agg
        .unwind({ path: '$parts', includeArrayIndex: 'partIndex' })
        .unwind('$parts.localization')
        .lookup({
            from: 'prints',
            let:  {
                cardId:    '$cardId',
                lang:      '$parts.localization.lang',
                partIndex: '$partIndex',
            },
            pipeline: [
                {
                    $unwind: {
                        path:              '$parts',
                        includeArrayIndex: 'partIndex',
                    },
                },
                {
                    $match: {
                        $expr: {
                            $and: [
                                { $eq: ['$cardId', '$$cardId'] },
                                { $eq: ['$lang', '$$lang'] },
                                { $eq: ['$partIndex', '$$partIndex'] },
                            ],
                        },
                    },
                },
            ],
            as: 'print',
        })
        .unwind({ path: '$print' })
        .addFields({ info: { id: '$cardId', lang: '$print.lang', part: '$print.partIndex' } });

    if (lang != null) {
        agg.match({ 'parts.localization.lang': lang });
    }

    agg
        .match(match)
        .group({ _id: '$info', releaseDate: { $max: '$print.releaseDate' } });

    return agg;
}

const needEditGetters: Record<string, (lang?: string) => Aggregate<INeedEditResult[]>> = {
    paren: lang => aggregate({
        lang,
        match: {
            'cardId':                  { $nin: internalData<string[]>('magic.special.with-paren') },
            'parts.localization.text': parenRegex,
            'parts.type.main':         { $nin: ['dungeon', 'card'] },
            'parts.type.main.0':       { $exists: true },
        },
    }),

    keyword: lang => aggregate({
        lang,
        match: {
            'cardId':                  { $nin: internalData<string[]>('magic.special.with-comma') },
            'parts.localization.text': commaRegex,
            'parts.type.main':         { $nin: ['dungeon', 'stickers', 'card'] },
        },
    }),

    token: () => aggregate({
        match: {
            'cardId':           { $not: /!/ },
            'parts.type.super': 'token',
        },
    }),
};

router.get('/need-edit', async ctx => {
    const { method, lang, sample: sampleText } = mapValues(ctx.query, toSingle);

    const getter = needEditGetters[method];

    const sample = Number.isNaN(Number.parseInt(sampleText, 10))
        ? 100
        : Number.parseInt(sampleText, 10);

    if (getter == null || Number.isNaN(sample)) {
        ctx.status = 404;
        return;
    }

    const total = (await getter(lang)).length;

    // console.log(JSON.stringify(await getter(lang).explain(), null, 4));

    if (total === 0) {
        ctx.body = {
            method,
            cards: [],
            total,
        };
        return;
    }

    const result = await getter(lang)
        .sort({ releaseDate: -1 })
        .limit(sample);

    const cards = await Print.aggregate().allowDiskUse(true)
        .match({ $or: result.map(r => ({ cardId: r._id.id, lang: r._id.lang })) })
        .sort({ releaseDate: -1 })
        .group({ _id: { id: '$cardId', lang: '$lang' }, print: { $first: '$$ROOT' } })
        .lookup({
            from:         'cards',
            localField:   'print.cardId',
            foreignField: 'cardId',
            as:           'card',
        })
        .unwind('card')
        .sort({ 'print.releaseDate': -1 });

    const resultCards = result.map(r => {
        const card = cards.find(c => c._id.id === r._id.id && c._id.lang === r._id.lang);

        if (card != null) {
            return {
                card:      card.card,
                print:     card.print,
                partIndex: r._id.part,
                result:    { method, ...omit(r, 'date') },
            };
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

        if (key === 'parts[0].text' && !c.tags.includes('dev:oracle')) {
            c.tags.push('dev:oracle');
        }

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

const assetBase = 'https://asset.tcg.cards';

router.get('/scan-card-text', async ctx => {
    const { set, number, lang, layout, partIndex = '0' } = mapValues(ctx.query, toSingle);

    const urls = (() => {
        if ([
            'transform',
            'modal_dfc',
            'transform_token',
            'minigame',
            'reversible_card',
            'double_faced',
            'battle',
            'art_series',
        ].includes(layout)) {
            return [
                `${assetBase}/magic/card/large/${set}/${lang}/${number}-0.jpg`,
                `${assetBase}/magic/card/large/${set}/${lang}/${number}-1.jpg`,
            ];
        } else if (['flip_token_top', 'flip_token_bottom'].includes(layout)) {
            return [
                `${assetBase}/magic/card/large/${set}/${lang}/${number.split('-')[0]}.jpg`,
            ];
        } else {
            return [
                `${assetBase}/magic/card/large/${set}/${lang}/${number}.jpg`,
            ];
        }
    })();

    const url = urls[Number.parseInt(partIndex, 10)] ?? urls[0];

    const response = await openai.chat.completions.create({
        model:    'qwen-vl-ocr-latest',
        messages: [
            {
                role:    'user',
                content: [
                    {
                        type: 'text',
                        text: '接下来将输入一张万智牌的卡牌图像，请提取图像中的卡牌名称、卡牌类别、效果文本和风味文字，模糊或者无法识别的符号或图标用{?}代替。返回数据格式以json方式输出，格式为：{ name: \'xxx\', typeline: \'xxx\', text: \'xxx\', flavorText: \'xxx\' }',
                    },
                    {
                        type:      'image_url',
                        image_url: { url },
                    },
                ],
            },
        ],
        response_format: {
            type: 'json_object',
        },
    });

    const content = response.choices[0].message.content;

    if (content == null) {
        ctx.status = 404;
        return;
    }

    try {
        const json = JSON.parse(content.replace(/^```json/, '').replace(/,?\n*```$/, ''));

        ctx.body = json;
    } catch (e) {
        console.log(content);
        throw e;
    }
});

export default router;
