import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Set from '@/magic/db/set';
import Print from '@/magic/db/print';

import { Set as ISet } from '@interface/magic/set';

import axios from 'axios';
import cheerio from 'cheerio';

import { mapValues, uniq } from 'lodash';
import { toSingle } from '@/common/request-helper';

import { locales, extendedLocales } from '@static/magic/basic';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/set');

router.get('/raw', async ctx => {
    const { id: setId } = mapValues(ctx.query, toSingle);

    const set = await Set.findOne({ setId });

    if (set != null) {
        ctx.body = set.toJSON();
    } else {
        ctx.status = 404;
    }
});

router.post('/save', async ctx => {
    const data = ctx.request.body.data as ISet;

    const set = await Set.findOne({ setId: data.setId });

    if (set != null) {
        await set.replaceOne(data);
    } else {
        await Set.create(data);
    }

    ctx.status = 200;
});

const rarities = [
    'common',
    'uncommon',
    'rare',
    'mythic',
    'special',
];

router.post('/calc', async ctx => {
    const sets = await Set.find();

    const allPrints = await Print.aggregate<{
        set: string;
        number: string;
        lang: string;
        rarity: string;
    }>().project({
        _id: 0, set: 1, number: 1, lang: 1, rarity: 1,
    });

    for (const set of sets) {
        const id = set.setId;

        const cards = allPrints.filter(c => c.set === id);

        set.cardCount = uniq(cards.map(c => c.number)).length;
        set.langs = uniq(cards.map(c => c.lang))
            .sort((a, b) => extendedLocales.indexOf(a) - extendedLocales.indexOf(b));
        set.rarities = uniq(cards.map(c => c.rarity))
            .sort((a, b) => rarities.indexOf(a) - rarities.indexOf(b));

        await set.save();
    }

    ctx.status = 200;
});

const linkMap: Record<string, string> = {
    en:  'en',
    de:  'de',
    es:  'es',
    fr:  'fr',
    it:  'it',
    ja:  'ja',
    ko:  'ko',
    pt:  'pt-br',
    ru:  'ru',
    zhs: 'zh-hans',
    zht: 'zh-hant',
};

router.get('/fill-link', async ctx => {
    const { link } = mapValues(ctx.query, toSingle);

    if (link == null || link === '') {
        return;
    }

    const result: Record<string, { link: string, name: string }> = { };

    for (const l of locales) {
        const localeUrl = link.replace('/en/', `/${linkMap[l]}/`);

        try {
            const html = await axios.get(localeUrl);

            const $ = cheerio.load(html.data);

            result[l] = {
                link: localeUrl,
                name: $('title').text().replace(/\|.*$/, ''),
            };
        } catch (e) {
            console.error(e.message);

            result[l] = {
                link: localeUrl,
                name: '',
            };
        }
    }

    ctx.body = result;
});

export default router;
