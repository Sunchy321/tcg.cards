import { os } from '@orpc/server';

import z from 'zod';
import * as fs from 'fs';
import path from 'path';

import { and, eq, ne, notInArray, sql } from 'drizzle-orm';

import internalData from '@/internal-data';
import { getEssentialMap, ApolloJson, intoApolloJson } from '@/hearthstone/apollo/into-json';

import { db } from '@/drizzle';
import { EntityView } from '@/hearthstone/schema/entity';

import { assetPath } from '@/config';

import { createAdjustmentJson as createAdjustmentJsonLogger } from '@/hearthstone/logger';
import { FormatChange } from '@/hearthstone/schema/game-change';

const variants = ['normal', 'golden', 'diamond', 'signature', 'battlegrounds', 'in-game'] as const;

const createPatchJson = os
    .input(z.int().positive())
    .output(z.file())
    .handler(async ({ input }) => {
        const version = input;

        const lang = 'zhs';

        const blacklist = internalData<string[]>('hearthstone.apollo-blacklist');

        const entities = await db.select({
            cardId:           EntityView.cardId,
            version:          EntityView.version,
            lang:             EntityView.lang,
            set:              EntityView.set,
            classes:          EntityView.classes,
            type:             EntityView.type,
            cost:             EntityView.cost,
            attack:           EntityView.attack,
            health:           EntityView.health,
            durability:       EntityView.durability,
            armor:            EntityView.armor,
            rune:             EntityView.rune,
            race:             EntityView.race,
            spellSchool:      EntityView.spellSchool,
            techLevel:        EntityView.techLevel,
            mercenaryFaction: EntityView.mercenaryFaction,
            elite:            EntityView.elite,
            rarity:           EntityView.rarity,
            mechanics:        EntityView.mechanics,
            localization:     EntityView.localization,
        })
            .from(EntityView)
            .where(and(
                notInArray(EntityView.cardId, blacklist),
                ne(EntityView.type, 'enchantment'),
                eq(EntityView.lang, lang), // TODO: support other languages
                ...version === 0 ? [] : [sql`${version} = ANY(${EntityView.version})`],
            ));

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

                const outName = `image@png@${Math.min(...e.version)}@${lang}@${v}@${e.cardId}`;

                const webpPath = `${path.join(assetPath, 'hearthstone', 'card', ...outName.split('@').map(p => p === 'png' ? 'webp' : p))}.webp`;

                if (fs.existsSync(webpPath)) {
                    continue;
                }

                result[outName] = {
                    ...intoApolloJson(e, tagMap, undefined, v),
                    outName,
                };
            }
        }

        const file = new File(
            [JSON.stringify(result, null, 2)],
            `apollo-patch-${version}.json`,
            { type: 'application/json' },
        );

        return file;
    });

const createAdjustmentJson = os
    .output(z.any())
    .handler(async () => {
        // const logger = createAdjustmentJsonLogger;

        // const changes = db.select().from(FormatChange)

        // const changes = await FormatChange.find({ type: 'adjustment' });

        // const tagMap = getEssentialMap();

        const result: Record<string, ApolloJson> = {};

        // const cardIds: string[] = [];

        // for (const c of changes) {
        //     if (!cardIds.includes(c.id)) {
        //         cardIds.push(c.id);
        //     }

        //     for (const a of c.adjustment!) {
        //         if (a.id != null && !cardIds.includes(a.id)) {
        //             cardIds.push(a.id);
        //         }
        //     }
        // }

        // const entities = await Entity.find({ cardId: { $in: cardIds } });

        // for (const [_i, c] of changes.entries()) {
        //     for (const a of c.adjustment!) {
        //         const id = a.id ?? c.id;

        //         const adjustment = a.detail.sort((a, b) => (a.part < b.part ? -1 : a.part > b.part ? 1 : 0))
        //             .map(v => `${v.part}${v.status[0]}`)
        //             .join('-');

        //         const fullName = `${id}-${adjustment}`;

        //         const oldEntity = entities.find(e => e.cardId === id && e.version.includes(c.lastVersion ?? c.version));
        //         const newEntity = entities.find(e => e.cardId === id && e.version.includes(c.version));

        //         if (oldEntity == null) {
        //             logger.error(`Unknown card ${id} at version ${c.lastVersion ?? c.version}`);
        //             continue;
        //         }

        //         if (newEntity == null) {
        //             logger.error(`Unknown card ${id} at version ${c.version}`);
        //             continue;
        //         }

        //         const variant = c.format === 'battlegrounds' ? 'battlegrounds' : 'normal';

        //         const oldName = `image@png@${c.lastVersion ?? c.version}@zhs@${variant}@${id}`;
        //         const newName = `adjusted@png@${c.version}@zhs@${variant}@${fullName}`;

        //         result[oldName] = {
        //             ...intoApolloJson(oldEntity, tagMap, undefined, variant),
        //             outName: oldName,
        //         };

        //         result[newName] = {
        //             ...intoApolloJson(newEntity, tagMap, a.detail, variant),
        //             outName: newName,
        //         };
        //     }

        //     if (!c.adjustment!.some(a => a.id == null || a.id === c.id)) {
        //         const { id } = c;

        //         const cardEntity = entities.find(e => e.cardId === c.id && e.version.includes(c.version));

        //         if (cardEntity == null) {
        //             logger.error(`Unknown card ${c.id} at version ${c.version}`);
        //             continue;
        //         }

        //         const variant = c.format === 'battlegrounds' ? 'battlegrounds' : 'normal';

        //         const outName = `image@png@${c.version}@zhs@${variant}@${id}`;

        //         const imagePath = `${path.join(assetPath, 'hearthstone', 'card', ...outName.split('@'))}.png`;

        //         if (fs.existsSync(imagePath)) {
        //             continue;
        //         }

        //         result[outName] = {
        //             ...intoApolloJson(cardEntity, tagMap, undefined, variant),
        //             outName,
        //         };
        //     }
        // }

        const file = new File(
            [JSON.stringify(result, null, 2)],
            'apollo-adjustment.json',
            { type: 'application/json' },
        );

        return file;
    });

export const apolloTrpc = {
    createPatchJson,
    createAdjustmentJson,
};
