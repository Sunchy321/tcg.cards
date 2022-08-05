import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

// import { createReadStream, existsSync } from 'fs';
import mime from 'mime-types';
// import { cardImagePath } from '@/magic/image';

// import { mapValues } from 'lodash';
// import { toSingle } from '@/common/request-helper';

// import { locales } from '@data/magic/basic';

import Entity from '@/hearthstone/db/entity';

import { Entity as IEntity } from '@interface/hearthstone/entity';

import renderEntity, { registerFonts } from '@renderer/index';

import { assetPath } from '@/static';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/card');

router.get('/', async ctx => {
    // const {
    //     lang = 'en', set, number, part: partString,
    // } = mapValues(ctx.query, toSingle);

    // if (set == null || number == null) {
    //     ctx.status = 400;
    //     return;
    // }

    // const part = partString != null ? Number.parseInt(partString, 10) : undefined;

    // if (partString != null && Number.isNaN(part)) {
    //     ctx.status = 400;
    //     return;
    // }

    // const pngPath = cardImagePath('png', set, lang, number, part);
    // const jpgPath = cardImagePath('large', set, lang, number, part);

    // if (existsSync(pngPath)) {
    //     ctx.response.set('content-type', mime.lookup(pngPath) as string);
    //     ctx.body = createReadStream(pngPath);
    //     return;
    // } else if (existsSync(jpgPath)) {
    //     ctx.response.set('content-type', mime.lookup(jpgPath) as string);
    //     ctx.body = createReadStream(jpgPath);
    //     return;
    // }

    // if (ctx.query['auto-locale'] != null) {
    //     for (const l of locales) {
    //         const otherPngPath = cardImagePath('png', set, l, number, part);
    //         const otherJpgPath = cardImagePath('large', set, l, number, part);

    //         if (existsSync(otherPngPath)) {
    //             ctx.response.set('content-type', mime.lookup(otherPngPath) as string);
    //             ctx.body = createReadStream(otherPngPath);
    //             return;
    //         } else if (existsSync(otherJpgPath)) {
    //             ctx.response.set('content-type', mime.lookup(otherJpgPath) as string);
    //             ctx.body = createReadStream(otherJpgPath);
    //             return;
    //         }
    //     }
    // }

    ctx.status = 404;
});

router.get('/test', async ctx => {
    ctx.response.set('content-type', mime.lookup('.png') as string);

    registerFonts(assetPath);

    const json = await (async () => {
        if (ctx.query.id != null) {
            const entity = await Entity.findOne({ cardId: ctx.query.id });

            return entity?.toObject() as IEntity;
        } else {
            const entities = await Entity.aggregate().match({ cardType: 'minion' }).sample(1);

            return entities[0] as IEntity;
        }
    })();

    if (json == null) {
        ctx.status = 404;
        return;
    }

    const localization = json.localization.find(l => l.lang === 'zhs')
        ?? json.localization.find(l => l.lang === 'en')
        ?? json.localization[0];

    const data = await renderEntity({
        cardType: 'minion',
        variant:  'normal',
        costType: 'mana',

        classes: json.classes,
        cost:    json.cost,
        attack:  json.attack,
        health:  json.health,

        ...localization,
    }, assetPath);

    ctx.body = data;
});

export default router;
