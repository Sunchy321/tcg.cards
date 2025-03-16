/* eslint-disable @typescript-eslint/no-explicit-any */
import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import { ObjectId } from 'mongoose';

import Print from '@/lorcana/db/print';

import { Print as IPrint } from '@interface/lorcana/print';
import { PrintUpdationCollection, PrintUpdationView } from '@common/model/lorcana/print';
import { Updation, WithUpdation } from '@common/model/updation';

import {
    omit, mapValues, isEqual, uniq,
} from 'lodash';
import { toSingle } from '@/common/request-helper';

import searcher from '@/lorcana/search';
import * as logger from '@/lorcana/logger';

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

    if (data.flavorText === '') {
        delete data.flavorText;
    }

    const old = await Print.findById(data._id);

    if (old != null) {
        await old.replaceOne(data);
    } else {
        await Print.create(omit(data, ['_id', '__v']) as IPrint);
    }

    ctx.status = 200;
});

router.get('/get-duplicate', async ctx => {
    const duplicates = await Print.aggregate<{ _id: { set: string, number: string, lang: string } }>()
        .group({
            _id: {
                set:    '$set',
                number: '$number',
                lang:   '$lang',
            },
            cardId: { $first: '$cardId' },
            count:  { $sum: 1 },
        })
        .sort({ cardId: 1 })
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

    logger.updation.info(`commit-updation(print), id=${id}(${print.cardId}/${print.set}/${print.number}/${print.lang}), key=${key}, type=${type}`);

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
