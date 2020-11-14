import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import jwtAuth from '@/middlewares/jwt-auth';

import Card, { ICard } from '../db/card';
import { Document } from 'mongoose';

import { escapeRegExp, omitBy, random } from 'lodash';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/card');

function findCard(id: string, lang?: string, set?: string, number?: string) {
    const aggregate = Card.aggregate().allowDiskUse(true);

    aggregate.match(omitBy({ cardId: id, setId: set, number }, v => v == null));

    if (lang != null) {
        aggregate.addFields({ langIsQuery: { $eq: ['$lang', lang] } });
    }

    aggregate.addFields({ langIsEnglish: { $eq: ['$lang', 'en'] } });
    aggregate.sort({ langIsQuery: -1, langIsEnglish: -1, releaseDate: -1 });
    aggregate.limit(1);

    return aggregate;
}

router.get('/', async ctx => {
    const { id, lang, set, number } = ctx.query;

    const aggregate = findCard(id, lang, set, number);

    const cards = await aggregate;
    const versions = await Card.aggregate()
        .match({ cardId: id })
        .sort({ releaseDate: -1 })
        .project('-_id lang setId number');

    if (cards.length !== 0) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _id, __v, ...data } = cards[0];

        ctx.body = {
            ...data,
            versions: versions.map(({ lang, setId, number }) => ({ lang, set: setId, number })),
        };
    } else {
        ctx.status = 404;
    }
});

router.get('/random', async ctx => {
    const cardId = await Card.distinct('cardId');

    ctx.body = cardId[random(cardId.length - 1)];
});

router.get('/raw',
    jwtAuth({ admin: true }),
    async ctx => {
        const { id: cardId, lang, set: setId, number } = ctx.query;

        const card = await Card.findOne({ cardId, lang, setId, number });

        if (card != null) {
            ctx.body = card.toJSON();
        } else {
            ctx.status = 404;
        }
    },
);

router.post('/update',
    jwtAuth({ admin: true }),
    async ctx => {
        const data: ICard & { _id: string } = ctx.request.body.data;

        const old = await Card.findById(data._id);

        if (old != null) {
            await old.replaceOne(data);

            for (let i = 0; i < data.parts.length; ++i) {
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

            ctx.status = 200;
        } else {
            ctx.status = 404;
        }
    },
);

interface INeedEditResult {
    _id: { id: string, lang: string, part: number }
}

function defaultAggregate(lang?: string) {
    const aggregate = Card.aggregate().allowDiskUse(true);

    if (lang != null) {
        aggregate.match({ lang });
    }

    aggregate
        .sort({ releaseDate: -1 })
        .unwind({ path: '$parts', includeArrayIndex: 'partIndex' })
        .addFields({ info: { id: '$cardId', lang: '$lang', part: '$partIndex' } });

    return aggregate;
}

const needEditGetters: Record<string, (lang?: string) => Promise<INeedEditResult[]>> = {
    'inconsistent-oracle': async lang => {
        return await defaultAggregate(lang)
            .group({
                _id:      '$info',
                name:     { $addToSet: '$parts.oracle.name' },
                typeline: { $addToSet: '$parts.oracle.typeline' },
                text:     { $addToSet: '$parts.oracle.text' },
            })
            .match({
                $or: [
                    { name: { $not: { $size: 1 } } },
                    { typeline: { $not: { $size: 1 } } },
                    { text: { $not: { $size: 1 } } },
                ],
            });
    },

    'inconsistent-unified': async lang => {
        return await defaultAggregate(lang)
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
            });
    },

    'parentheses': async lang => await defaultAggregate(lang)
        .match({
            $or: [
                { 'parts.oracle.text': /\(.+\)/ },
                { 'parts.unified.text': /[(（].+[)）]/ },
            ],
        })
        .group({ _id: '$info' }),
};

router.get('/need-edit',
    jwtAuth({ admin: true }),
    async ctx => {
        const getter = needEditGetters[ctx.query.type];

        if (getter == null) {
            ctx.status = 404;
            return;
        }

        const result = await getter(ctx.query.lang);

        if (result.length > 0) {
            const cards = await findCard(result[0]._id.id, ctx.query.lang);

            if (cards.length > 0) {
                ctx.body = {
                    ...cards[0],
                    partIndex: result[0]._id.part,
                    total:     result.length,
                };
            } else {
                ctx.body = null;
            }
        } else {
            ctx.body = null;
        }
    },
);

router.post('/remove-text',
    jwtAuth({ admin: true }),
    async ctx => {
        const { text, lang } = ctx.request.body;

        const matchRegex = new RegExp(escapeRegExp(text));
        const replaceRegex = new RegExp(' *' + escapeRegExp(text) + ' *');

        for await (const card of Card.find({
            lang,
            $or: [
                { 'parts.oracle.text': matchRegex },
                { 'parts.unified.text': matchRegex },
            ],
        }) as unknown as AsyncGenerator<ICard & Document>) {
            for (const p of card.parts) {
                if (p.oracle.text) {
                    p.oracle.text = p.oracle.text.replace(replaceRegex, '');
                }

                if (p.unified.text) {
                    p.unified.text = p.unified.text.replace(replaceRegex, '');
                }
            }

            await card.save();
        }

        ctx.status = 200;
    },
);

export default router;
