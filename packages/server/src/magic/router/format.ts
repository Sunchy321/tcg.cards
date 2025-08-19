import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator as zValidator } from 'hono-openapi/zod';

import z from 'zod';

import { eq } from 'drizzle-orm';

import { db } from '@/drizzle';
import { Format } from '../schema/format';
import { FormatChange } from '../schema/game-change';

import { format } from '@model/magic/schema/format';
import { formatChange } from '@model/magic/schema/game-change';

const formatBase = new Hono()
    .get(
        '/full',
        describeRoute({
            tags:      ['Magic', 'Format'],
            summary:   'Get format by ID',
            responses: {
                200: {
                    description: 'Format details',
                    content:     {
                        'application/json': {
                            schema: resolver(format),
                        },
                    },
                },
            },
            validateResponse: true,
        }),
        zValidator('query', z.object({ formatId: z.string() })),
        async c => {
            const { formatId } = c.req.valid('query');

            const format = await db.select()
                .from(Format)
                .where(eq(Format.formatId, formatId))
                .then(rows => rows[0]);

            if (format == null) {
                return c.notFound();
            }

            return c.json(format);
        },
    )
    .get(
        '/changes',
        describeRoute({
            tags:      ['Magic', 'Format'],
            summary:   'Get format changes by ID',
            responses: {
                200: {
                    description: 'Format details',
                    content:     {
                        'application/json': {
                            schema: resolver(formatChange.array()),
                        },
                    },
                },
            },
            validateResponse: true,
        }),
        zValidator('query', z.object({ formatId: z.string() })),
        async c => {
            const { formatId } = c.req.valid('query');

            const formatChanges = await db.select()
                .from(FormatChange)
                .where(eq(FormatChange.format, formatId))
                .orderBy(FormatChange.effectiveDate);

            if (formatChanges == null) {
                return c.notFound();
            }

            return c.json(formatChanges);
        },
    );

export const formatRouter = new Hono().route('/', formatBase);
export const formatApi = new Hono().route('/', formatBase);
