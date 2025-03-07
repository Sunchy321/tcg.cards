import KoaRouter from '@koa/router';
import { Context, DefaultState } from 'koa';

import FormatChange from '@/hearthstone/db/format-change';
import Entity from '@/hearthstone/db/entity';

import { Entity as IEntity } from '@interface/hearthstone/entity';
import { ITag } from '@/hearthstone/hsdata';

import * as path from 'path';
import * as fs from 'fs';

import internalData from '@/internal-data';

import { assetPath } from '@/config';

import { createAdjustmentJson } from '@/hearthstone/logger';
import { omitBy, pickBy } from 'lodash';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/apollo');

const variantInput: Record<string, any> = {
    'normal': { },
    'golden': {
        premium: 1,
    },
    'diamond': {
        premium: 2,
    },
    'signature': {
        premium: 3,
    },
    'battlegrounds': {
        useBattlegroundsStyle: 1,
    },
    'in-game': {
        useHeroStyle: 1,
    },
};

router.post('/create-adjustment-json', async ctx => {
    const changes = await FormatChange.find({ type: 'adjustment' });

    const result: Record<string, any> = {};

    const field = internalData<Record<number, ITag>>('hearthstone.tag.field');
    const locField = internalData<Record<number, keyof IEntity['localization'][0]>>('hearthstone.tag.localization-field');
    const type = internalData<Record<number, string>>('hearthstone.tag.map.type');
    const race = internalData<Record<number, string>>('hearthstone.tag.map.race');
    const dualRace = internalData<Record<number, string>>('hearthstone.tag.map.dual-race');
    const spellSchool = internalData<Record<number, string>>('hearthstone.tag.map.spell-school');
    const rune = internalData<Record<number, string>>('hearthstone.tag.map.rune');
    const set = internalData<Record<number, string>>('hearthstone.tag.map.set');
    const rarity = internalData<Record<number, string>>('hearthstone.tag.map.rarity');
    const mechanic = internalData<Record<number, string>>('hearthstone.tag.map.mechanic');

    const tagMap = {
        field,
        type,
        race,
        dualRace,
        spellSchool,
        rune,
        set,
        rarity,
        mechanic,
    };

    const fieldKey = (key: keyof IEntity) => Number.parseInt(Object.entries(field).find(v => v[1].index === key)![0], 10);
    const locFieldKey = (key: keyof IEntity['localization'][0]) => Number.parseInt(Object.entries(locField).find(v => v[1] === key)![0], 10);

    const entityIds: string[] = [];

    for (const c of changes) {
        if (!entityIds.includes(c.id)) {
            entityIds.push(c.id);
        }

        for (const a of c.adjustment!) {
            if (a.id != null && !entityIds.includes(a.id)) {
                entityIds.push(a.id);
            }
        }
    }

    const entities = await Entity.find({ entityId: { $in: entityIds } });

    for (const [i, c] of changes.entries()) {
        for (const a of c.adjustment!) {
            const id = a.id ?? c.id;

            const adjustment = a.detail.sort((a, b) => (a.part < b.part ? -1 : a.part > b.part ? 1 : 0))
                .map(v => `${v.part}${v.status[0]}`)
                .join('-');

            const fullName = `${id}-${adjustment}`;

            const oldEntity = entities.find(e => e.entityId === id && e.version.includes(c.lastVersion ?? c.version));
            const newEntity = entities.find(e => e.entityId === id && e.version.includes(c.version));

            if (oldEntity == null) {
                createAdjustmentJson.error(`Unknown card ${id} at version ${c.lastVersion ?? c.version}`);
                continue;
            }

            if (newEntity == null) {
                createAdjustmentJson.error(`Unknown card ${id} at version ${c.version}`);
                continue;
            }

            const oldLoc = oldEntity.localization.find(v => v.lang === 'zhs')
                ?? oldEntity.localization.find(v => v.lang === 'en')
                ?? oldEntity.localization[0];

            const newLoc = newEntity.localization.find(v => v.lang === 'zhs')
                ?? newEntity.localization.find(v => v.lang === 'en')
                ?? newEntity.localization[0];

            const oldTags = oldEntity.intoTags(tagMap);
            const newTags = newEntity.intoTags(tagMap);

            const oldJson = {
                cardID:   id,
                cardName: oldLoc.name,
                cardText: oldLoc.rawText,
                tags:     oldTags,
            };

            const newJson = {
                cardID:   id,
                cardName: newLoc.name,
                cardText: newLoc.rawText,
                tags:     newTags,
            };

            const nerf: Record<number, number> = {};

            const partMap: Record<string, number> = {
                cost:          fieldKey('cost'),
                attack:        fieldKey('attack'),
                health:        fieldKey('health'),
                durability:    fieldKey('health'),
                armor:         fieldKey('armor'),
                text:          locFieldKey('rawText'),
                race:          fieldKey('race'),
                techLevel:     fieldKey('techLevel'),
                rarity:        fieldKey('rarity'),
                school:        fieldKey('spellSchool'),
                colddown:      fieldKey('colddown'),
                mercenaryRole: fieldKey('mercenaryRole'),
                rune:          2196, // hardcoded blood rune
            };

            for (const d of a.detail) {
                if (partMap[d.part] != null) {
                    nerf[partMap[d.part]] = d.status === 'buff' ? 1 : 2;
                } else {
                    createAdjustmentJson.info(`Unknown part ${d.part}`);
                }
            }

            const filterNerf = pickBy(nerf, (value, key) => {
                // Hero Power has no nerf effect
                if (oldEntity.type === 'hero_power') {
                    return false;
                }

                // Trinket's nerf effect is at wrong place
                if (oldEntity.mechanics.includes('trinket')) {
                    return false;
                }

                return true;
            });

            const variant = c.format === 'battlegrounds' ? 'battlegrounds' : 'normal';

            result[`image@${c.lastVersion ?? c.version}@zhs@${variant}@${id}`] = {
                ...oldJson,
                ...variantInput[variant],
                outName: `image@${c.lastVersion ?? c.version}@zhs@${variant}@${id}`,
            };

            result[`adjusted@${c.version}@zhs@${variant}@${fullName}`] = {
                ...newJson,
                ...variantInput[variant],
                outName: `adjusted@${c.version}@zhs@${variant}@${fullName}`,
                nerf:    filterNerf,
            };
        }

        if (!c.adjustment!.some(a => a.id == null || a.id === c.id)) {
            const { id } = c;

            const cardEntity = entities.find(e => e.entityId === c.id && e.version.includes(c.version));

            if (cardEntity == null) {
                createAdjustmentJson.error(`Unknown card ${c.id} at version ${c.version}`);
                continue;
            }

            const cardLoc = cardEntity.localization.find(v => v.lang === 'zhs')
                ?? cardEntity.localization.find(v => v.lang === 'en')
                ?? cardEntity.localization[0];

            const cardTags = cardEntity.intoTags(tagMap);

            const cardJson = {
                cardID:   id,
                cardName: cardLoc.name,
                cardText: cardLoc.rawText,
                tags:     cardTags,
            };

            const variant = c.format === 'battlegrounds' ? 'battlegrounds' : 'normal';

            result[`image@${c.version}@zhs@${variant}@${id}`] = {
                ...cardJson,
                ...variantInput[variant],
                outName: `image@${c.version}@zhs@${variant}@${id}`,
            };
        }
    }

    ctx.status = 200;

    ctx.body = omitBy(result, (value, key) => {
        const imagePath = `${path.join(assetPath, 'hearthstone', 'card', ...key.split('@'))}.png`;

        return fs.existsSync(imagePath);
    });
});

export default router;
