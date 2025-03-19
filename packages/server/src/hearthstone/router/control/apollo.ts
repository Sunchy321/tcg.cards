import KoaRouter from '@koa/router';
import { Context, DefaultState } from 'koa';

import FormatChange from '@/hearthstone/db/format-change';
import Entity from '@/hearthstone/db/entity';

import * as path from 'path';
import * as fs from 'fs';

import { ApolloJson, getEssentialMap, intoApolloJson } from '@/hearthstone/apollo/into-json';

import { assetPath } from '@/config';

import { createAdjustmentJson } from '@/hearthstone/logger';
import { omitBy } from 'lodash';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/apollo');

const variants = ['normal', 'golden', 'diamond', 'signature', 'battlegrounds', 'in-game'] as const;

router.post('/create-patch-json', async ctx => {
    const { version } = ctx.request.body as { version: number };

    if (version == null) {
        return;
    }

    const entities = await Entity.find({ version, type: { $exists: true, $ne: 'enchantment' } });

    const tagMap = getEssentialMap();

    const result: Record<string, ApolloJson> = {};

    for (const e of entities) {
        for (const v of variants) {
            if (v === 'diamond' && !e.mechanics.includes('has_diamond')) {
                continue;
            }

            if (v === 'signature' && !e.mechanics.includes('has_signature')) {
                continue;
            }

            if (v === 'in-game' && e.type === 'spell') {
                continue;
            }

            if (v === 'battlegrounds' && (e.set !== 'bgs' && e.techLevel == null)) {
                continue;
            }

            const outName = `image@${Math.min(...e.version)}@zhs@${v}@${e.entityId}`;

            const imagePath = `${path.join(assetPath, 'hearthstone', 'card', ...outName.split('@'))}.png`;

            if (fs.existsSync(imagePath)) {
                continue;
            }

            result[outName] = {
                ...intoApolloJson(e, tagMap, undefined, v),
                outName,
            };
        }
    }

    if (Object.keys(result).length === 0) {
        return;
    }

    ctx.status = 200;

    ctx.body = result;
});

router.post('/create-adjustment-json', async ctx => {
    const changes = await FormatChange.find({ type: 'adjustment' });

    const tagMap = getEssentialMap();

    const result: Record<string, ApolloJson> = {};

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

    for (const [_i, c] of changes.entries()) {
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

            const variant = c.format === 'battlegrounds' ? 'battlegrounds' : 'normal';

            const oldName = `image@${c.lastVersion ?? c.version}@zhs@${variant}@${id}`;
            const newName = `adjusted@${c.version}@zhs@${variant}@${fullName}`;

            result[oldName] = {
                ...intoApolloJson(oldEntity, tagMap, undefined, variant),
                outName: oldName,
            };

            result[newName] = {
                ...intoApolloJson(newEntity, tagMap, a.detail, variant),
                outName: newName,
            };
        }

        if (!c.adjustment!.some(a => a.id == null || a.id === c.id)) {
            const { id } = c;

            const cardEntity = entities.find(e => e.entityId === c.id && e.version.includes(c.version));

            if (cardEntity == null) {
                createAdjustmentJson.error(`Unknown card ${c.id} at version ${c.version}`);
                continue;
            }

            const variant = c.format === 'battlegrounds' ? 'battlegrounds' : 'normal';

            const outName = `image@${c.version}@zhs@${variant}@${id}`;

            result[outName] = {
                ...intoApolloJson(cardEntity, tagMap, undefined, variant),
                outName,
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
