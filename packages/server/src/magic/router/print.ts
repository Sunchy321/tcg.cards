import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';

import z from 'zod';

import { and, eq } from 'drizzle-orm';

import { db } from '@/drizzle';
import { PrintView } from '../schema/print';

import { fullLocale } from '@model/magic/schema/basic';
import { printView } from '@model/magic/schema/print';

export const printApi = new Hono()
    .get(
        '/',
        describeRoute({
            description: 'Get card by ID',
            tags:        ['Magic', 'Card'],
            responses:   {
                200: {
                    description: 'Card full view',
                    content:     {
                        'application/json': {
                            schema: resolver(printView),
                        },
                    },
                },
            },
            validateResponse: true,
        }),
        zValidator('query', z.object({
            id:        z.string(),
            set:       z.string(),
            number:    z.string(),
            lang:      fullLocale,
            partIndex: z.string().default('0').transform(v => Number.parseInt(v, 10) || 0).pipe(z.int()),
        })),
        async c => {
            const { id: cardId, set, number, lang, partIndex } = c.req.valid('query');

            const views = await db.select()
                .from(PrintView)
                .where(and(
                    eq(PrintView.cardId, cardId),
                    eq(PrintView.set, set),
                    eq(PrintView.number, number),
                    eq(PrintView.lang, lang),
                    eq(PrintView.partIndex, partIndex),
                ));

            if (views.length === 0) {
                return c.notFound();
            }

            return c.json(views[0]);
        },
    );
