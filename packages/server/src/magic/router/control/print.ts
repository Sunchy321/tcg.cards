/* eslint-disable @typescript-eslint/no-explicit-any */
import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import { Aggregate, ObjectId } from 'mongoose';

import Card from '@/magic/db/card';
import Print from '@/magic/db/print';
import Format from '@/magic/db/format';

import { Print as IPrint } from '@interface/magic/print';
import { PrintUpdationCollection, PrintUpdationView } from '@common/model/magic/print';
import { Updation, WithUpdation } from '@common/model/updation';

import { existsSync, renameSync } from 'fs';
import {
    omit, mapValues, isEqual, uniq,
} from 'lodash';
import { toSingle } from '@/common/request-helper';
import internalData from '@/internal-data';

import {
    CardLegalityView, LegalityRecorder, getLegality, getLegalityRules, lookupPrintsForLegality,
} from '@/magic/banlist/legality';

import parseGatherer, { saveGathererImage } from '@/magic/gatherer/parse';

import searcher from '@/magic/search';

import { assetPath } from '@/config';
import { formats as formatList } from '@static/magic/basic';
import { parenRegex, commaRegex } from '@static/magic/special';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/print');

router.get('/raw', async ctx => {
    const {
        id: cardId, lang, set, number,
    } = mapValues(ctx.query, toSingle);

    const print = await Print.findOne({
        cardId, lang, set, number,
    });

    if (print != null) {
        ctx.body = print.toObject();
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
    const { data } = ctx.request.body as { data: IPrint & { _id: ObjectId } };

    for (const p of data.parts) {
        if (p.flavorText === '') {
            delete p.flavorText;
        }
    }

    const old = await Print.findById(data._id);

    if (old != null) {
        await old.replaceOne(data);
    } else {
        await Print.create(omit(data, ['_id', '__v']) as IPrint);
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
    const agg = Print.aggregate().allowDiskUse(true);

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
                date:          { $max: '$releaseDate' },
            })
            .match({
                ...lang != null ? { '_id.lang': lang } : {},
                $or: [
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
                _id:  '$info',
                name: { $addToSet: '$parts.unified.name' },
                type: { $addToSet: '$parts.unified.typeline' },
                text: { $addToSet: '$parts.unified.text' },
                date: { $max: '$releaseDate' },
            })
            .match({
                $or: [
                    { 'name.1': { $exists: true } },
                    { 'type.1': { $exists: true } },
                    { 'text.1': { $exists: true } },
                ],
            })
            .addFields({
                nameCount: { $size: '$name' },
                typeCount: { $size: '$type' },
                textCount: { $size: '$text' },
            })
            .addFields({
                unifiedIndicator: {
                    $cond: {
                        if:   { $gt: ['$nameCount', 1] },
                        then: { $multiply: ['$nameCount', 10000] },
                        else: {
                            $cond: {
                                if:   { $gt: ['$typeCount', 1] },
                                then: { $multiply: ['$typeCount', 100] },
                                else: '$textCount',
                            },
                        },
                    },
                },
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

    const prints = await Print.aggregate().allowDiskUse(true)
        .match({ $or: result.map(r => ({ cardId: r._id.id, lang: r._id.lang })) })
        .sort({ releaseDate: -1 })
        .group({ _id: { id: '$cardId', lang: '$lang' }, card: { $first: '$$ROOT' } });

    const results = result.map(r => {
        const print = prints.find(c => c._id.id === r._id.id && c._id.lang === r._id.lang);

        if (print != null) {
            return { ...print.card, partIndex: r._id.part, result: { method, ...omit(r, 'date') } };
        } else {
            return null;
        }
    }).filter(v => v != null);

    ctx.body = {
        method,
        cards: results,
        total,
    };
});

router.get('/rename', async ctx => {
    const { set } = mapValues(ctx.query, toSingle);

    if (set == null) {
        ctx.status = 404;
        return;
    }

    const prints = await Print.find({ set, lang: 'zhs' });

    const cards = await Card.find({ cadId: { $in: prints.map(p => p.cardId) } });

    const renamed = [];
    const missed = [];

    for (const p of prints) {
        const c = cards.find(c => c.cardId === p.cardId);

        if (c == null) {
            missed.push([p.cardId, p.parts.map(p => p.name)]);
            continue;
        }

        const { name } = c.parts[0];

        const oldPath = `${assetPath}/magic/card/large/${set}/zhs/${name.replace(':', '')}.full.jpg`;
        const oldPathWithNumber = `${assetPath}/magic/card/large/${set}/zhs/${name.replace(':', '')}.${p.number}.full.jpg`;
        const newPath = `${assetPath}/magic/card/large/${set}/zhs/${p.number}.jpg`;

        if (existsSync(newPath)) {
            continue;
        }

        if (existsSync(oldPath)) {
            renameSync(oldPath, newPath);

            renamed.push(`${name} -> ${p.number}`);
        } else if (existsSync(oldPathWithNumber)) {
            renameSync(oldPathWithNumber, newPath);

            renamed.push(`${name}.${p.number} -> ${p.number}`);
        } else {
            missed.push([p.cardId, c.parts.map(p => p.name), p.number]);
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

router.get('/get-duplicate', async ctx => {
    const duplicates = await Print.aggregate<{ _id: { set: string, number: string, lang: string } }>()
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

    const prints = await Print.find({ set: first.set, number: first.number, lang: first.lang });

    ctx.body = {
        total:  duplicates.length,
        values: prints.map(c => c.toJSON()),
    };
});

router.post('/resolve-duplicate', async ctx => {
    const { data } = ctx.request.body as { data: IPrint };

    await Print.deleteMany({ set: data.set, number: data.number, lang: data.lang });

    await Print.insertMany(data);

    ctx.status = 200;
});

router.get('/get-updation', async ctx => {
    const keys = await Print.aggregate<{ _id: string, count: number }>()
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
        } as PrintUpdationCollection;
        return;
    }

    const minimumKey = keys[0]._id;
    const current = keys[0].count;
    const total = keys.reduce((acc, cur) => acc + cur.count, 0);

    const updations = await Print.aggregate<PrintUpdationView>()
        .match({ '__updations.key': minimumKey })
        .unwind('__updations')
        .match({ '__updations.key': minimumKey })
        .sort({ releaseDate: 1, cardId: 1 })
        .project({
            _id:        '$_id',
            cardId:     '$cardId',
            set:        '$set',
            number:     '$number',
            lang:       '$lang',
            scryfallId: '$scryfall.cardId',

            key:      '$__updations.key',
            oldValue: '$__updations.oldValue',
            newValue: '$__updations.newValue',
        });

    ctx.body = {
        total,
        key:    minimumKey,
        current,
        values: updations,
    } as PrintUpdationCollection;
});

function access(print: WithUpdation<IPrint>, key: string) {
    const keyParts = (`.${key}`).split(/(\.[a-z_]+|\[[^]]+\])/i).filter(v => v !== '');

    let object: any = print;

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

function rejectUpdation(print: WithUpdation<IPrint>, updation: Updation) {
    const { key } = updation;

    const keyParts = (`.${key}`).split(/(\.[a-z_]+|\[[^]]+\])/i).filter(v => v !== '');

    let object: any = print;

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

    print.__lockedPaths.push(key);
}

router.post('/commit-updation', async ctx => {
    const {
        id, key, type,
    } = ctx.request.body as {
        id: string; key: string; type: string;
    };

    const print = await Print.findOne({ _id: id });

    if (print == null) {
        ctx.status = 200;
        return;
    }

    const updation = print.__updations.find(u => u.key === key);

    if (updation == null) {
        ctx.status = 200;
        return;
    }

    print.__updations = print.__updations.filter(u => u.key !== key);

    if (type === 'reject') {
        rejectUpdation(print, updation);
    }

    await print.save();

    console.log(`commit updation, id=${id}, key=${key}, type=${type}`);

    ctx.status = 200;
});

router.post('/accept-all-updation', async ctx => {
    const { key } = ctx.request.body as { key: string };

    const print = await Print.find({ '__updations.key': key });

    for (const p of print) {
        p.__updations = p.__updations.filter(u => u.key !== key);

        if (key === 'parts[0].text' && !p.tags.includes('dev:oracle')) {
            p.tags.push('dev:oracle');
        }

        await p.save();
    }

    ctx.status = 200;
});

router.post('/reject-all-updation', async ctx => {
    const { key } = ctx.request.body as { key: string };

    const prints = await Print.find({ '__updations.key': key });

    for (const p of prints) {
        const updation = p.__updations.filter(u => u.key === key);

        if (updation.length !== 1) {
            continue;
        }

        p.__updations = p.__updations.filter(u => u.key !== key);
        rejectUpdation(p, updation[0]);
        await p.save();
    }

    ctx.status = 200;
});

router.post('/accept-unchanged', async ctx => {
    const { key } = ctx.request.body as { key: string };

    const prints = await Print.find({ '__updations.key': key });

    for (const p of prints) {
        const updations = p.__updations.filter(u => u.key === key);

        const currentValue = access(p, key);
        const originalValue = updations[0].oldValue;

        if (isEqual(currentValue, originalValue) || (currentValue == null && originalValue == null)) {
            p.__updations = p.__updations.filter(u => u.key !== key);
            await p.save();
            continue;
        }

        if (key === 'tags') {
            if (updations.length !== 1) {
                continue;
            }

            const oldValue = [...updations[0].oldValue].sort();
            const newValue = uniq([...updations[0].newValue, 'dev:printed']).sort();

            if (isEqual(oldValue, newValue)) {
                p.__updations = p.__updations.filter(u => u.key !== key);
                p.tags = updations[0].oldValue;
                await p.save();
            }
        }
    }

    ctx.status = 200;
});

export default router;
