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

const variants = ['normal', 'golden', 'diamond', 'signature', 'battlegrounds', 'in-game'] as const;

const createPatchJson = os
    .input(z.int().positive())
    .output(z.any())
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

        return result;
    });

export const apolloTrpc = {
    createPatchJson,
};
