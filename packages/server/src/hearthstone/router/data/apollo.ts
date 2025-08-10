import { Hono } from 'hono';
import { validator } from 'hono-openapi/zod';

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

export const apolloRouter = new Hono()
    .post(
        '/create-patch-json',
        validator('query', z.object({
            version: z.preprocess(val => Number.parseInt(val as string, 10), z.number().int().min(0)),
        })),
        async c => {
            const { version } = c.req.valid('query');

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

            return c.json(result);
        },
    );
