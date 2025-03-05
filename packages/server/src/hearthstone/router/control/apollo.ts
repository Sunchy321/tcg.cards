import KoaRouter from '@koa/router';
import { Context, DefaultState } from 'koa';

import FormatChange from '@/hearthstone/db/format-change';
import Entity from '@/hearthstone/db/entity';

import { Entity as IEntity } from '@interface/hearthstone/entity';
import { ITag } from '@/hearthstone/hsdata';

import internalData from '@/internal-data';

import { createAdjustmentJson } from '@/hearthstone/logger';

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

            const oldTags = oldEntity.intoTags();
            const newTags = newEntity.intoTags();

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
                text:          locFieldKey('rawText'),
                race:          fieldKey('race'),
                techLevel:     fieldKey('techLevel'),
                rarity:        fieldKey('rarity'),
                school:        fieldKey('spellSchool'),
                colddown:      fieldKey('colddown'),
                mercenaryRole: fieldKey('mercenaryRole'),
                rune:          2196, // hardcoded blood rune
            };

            if (oldEntity.type !== 'hero_power') {
                for (const d of a.detail) {
                    if (partMap[d.part] != null) {
                        nerf[partMap[d.part]] = d.status === 'buff' ? 1 : 2;
                    } else {
                        createAdjustmentJson.info(`Unknown part ${d.part}`);
                    }
                }
            }

            const variant = c.format === 'battlegrounds' ? 'battlegrounds' : 'normal';

            result[`image@${c.lastVersion ?? c.version}@zhs@${variant}@${id}`] = {
                ...oldJson,
                outName: `image@${c.lastVersion ?? c.version}@zhs@${variant}@${id}`,
                ...variantInput[variant],
            };

            result[`adjusted@${c.version}@zhs@${variant}@${fullName}`] = {
                ...newJson,
                outName: `adjusted@${c.version}@zhs@${variant}@${fullName}`,
                ...variantInput[variant],
                nerf,
            };
        }
    }

    ctx.status = 200;
    ctx.body = result;
});

export default router;
