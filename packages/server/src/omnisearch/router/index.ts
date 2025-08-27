import { os } from '@orpc/server';

import z from 'zod';
import _ from 'lodash';

import { Locale, Types } from '@model/hearthstone/schema/basic';

import { searchInput } from '@search/schema';
import { searchResult } from '@model/omnisearch/schema/search';

import { sql } from 'drizzle-orm';

import { db } from '@/drizzle';
import { HearthstoneTypeLocalization } from '../schema/localization';
import { CardView } from '../schema/card';

import search from '../search';
import internalData from '@/internal-data';

import { Game, games } from '@model/schema';

const random = os
    .route({
        method:      'GET',
        description: 'Get random card ID',
        tags:        ['Omni', 'Card'],
    })
    .input(z.any())
    .output(z.strictObject({
        game:   z.enum(games),
        cardId: z.string(),
    }))
    .handler(async () => {
        const result = await db.execute<{
            game:    string;
            card_id: string;
        }>(sql`select game, card_id from omnisearch.card_view tablesample system_rows(1)`);

        const card = result.rows[0];

        return {
            game:   card.game as Game,
            cardId: card.card_id,
        };
    });

const searchAction = os
    .route({
        method:      'GET',
        description: 'Search for cards',
        tags:        ['Omni', 'Search'],
    })
    .input(searchInput.extend({
        lang:    z.string().default('en'),
        orderBy: z.string().default('id+'),
    }))
    .output(searchResult)
    .handler(async ({ input }) => {
        const { q, page, pageSize, lang, orderBy } = input;

        const result = await search.search('search', q, {
            page,
            pageSize,
            lang,
            orderBy,
        });

        console.log(result);

        return result;
    });

const syncLoc = os
    .input(z.void())
    .output(z.void())
    .handler(async () => {
        const typeLoc = internalData<Record<Types, Record<Locale, string>>>('hearthstone.localization.type');

        await db.transaction(async tx => {
            await tx.delete(HearthstoneTypeLocalization);

            const toInsert = Object.entries(typeLoc).flatMap(([type, loc]) =>
                Object.entries(loc).map(([lang, text]) => ({
                    type: type as Types,
                    lang: lang as Locale,
                    text,
                })),
            );

            if (toInsert.length > 0) {
                await tx.insert(HearthstoneTypeLocalization).values(toInsert);
            }
        });
    });

const refresh = os
    .input(z.void())
    .output(z.void())
    .handler(async () => {
        await db.refreshMaterializedView(CardView);
    });

export const omniTrpc = {
    random,
    search: searchAction,
    syncLoc,
    refresh,
};

export const omniApi = {
    random,
    search: searchAction,
};
