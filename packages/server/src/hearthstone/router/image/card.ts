import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import mime from 'mime-types';

import { flatten, mapValues } from 'lodash';
import { toSingle } from '@/common/request-helper';

import Card from '@/hearthstone/db/card';

import { Card as ICard } from '@interface/hearthstone/card';
import { Adjustment } from '@interface/hearthstone/format-change';

import renderEntity, { registerFonts } from '@renderer/index';

import { assetPath } from '@/config';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/card');

router.get('/', async ctx => {
    const {
        id, lang, version: versionText, adjustment: adjustmentText, format,
    } = mapValues(ctx.query, toSingle);

    const version = versionText != null ? Number.parseInt(versionText, 10) : null;

    if (Number.isNaN(version)) {
        ctx.status = 400;
        return;
    }

    const adjustment = (adjustmentText ?? '')
        .split(',')
        .map(a => {
            const p = a.split(':');

            return {
                part:   p[0],
                status: (p[1] ?? 'nerf') as Adjustment,
            };
        });

    registerFonts(assetPath);

    const query: any = { cardId: id };

    if (version != null) {
        query.version = version;
    }

    const cards = await Card.find(query);

    const cardVersion = version ?? Math.max(...flatten(cards.map(e => e.version)));

    const card = cards.find(e => e.version.includes(cardVersion));

    if (card == null) {
        ctx.status = 404;
        return;
    }

    const json = card.toObject() as ICard;

    const localization = json.localization.find(l => l.lang === lang)
        ?? json.localization.find(l => l.lang === 'en')
        ?? json.localization[0];

    try {
        const data = await renderEntity({
            type:     json.type,
            variant:  'normal',
            format,
            costType: 'mana',

            entityId: json.entityId[0],

            ...localization,
            text: localization.displayText,

            set:         json.set[0],
            classes:     json.classes,
            cost:        json.cost,
            attack:      json.attack,
            health:      json.health,
            durability:  json.durability,
            armor:       json.armor,
            rune:        json.rune,
            race:        json.race,
            spellSchool: json.spellSchool,

            techLevel:     json.techLevel,
            inBobsTavern:  json.inBobsTavern,
            tripleCard:    json.tripleCard,
            raceBucket:    json.raceBucket,
            coin:          json.coin,
            armorBucket:   json.armorBucket,
            buddy:         json.buddy,
            bannedRace:    json.bannedRace,
            mercenaryRole: json.mercenaryRole,
            colddown:      json.colddown,

            collectible: json.collectible,
            elite:       json.elite,
            rarity:      json.rarity,

            mechanics: json.mechanics,

            adjustment,
        }, assetPath);

        ctx.response.set('content-type', mime.lookup('.png') as string);

        ctx.body = data;
    } catch (err) {
        console.log(err.message);
        ctx.status = 404;
    }
});

export default router;
