import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator as zValidator } from 'hono-openapi/zod';

import z from 'zod';

import { eq } from 'drizzle-orm';

import { db } from '@/drizzle';
import { Format } from '../schema/format';

import { formatSchema } from '@model/magic/schema/format';

const formatBase = new Hono()
    .get(
        '/full',
        describeRoute({
            tags:      ['Format'],
            summary:   'Get format by ID',
            responses: {
                200: {
                    description: 'Format details',
                    content:     {
                        'application/json': {
                            schema: resolver(formatSchema),
                        },
                    },
                },
            },
        }),
        zValidator('query', z.object({ formatId: z.string() })),
        async c => {
            const { formatId } = c.req.valid('query');

            const format = await db.select()
                .from(Format)
                .where(eq(Format.formatId, formatId));

            if (format[0] == null) {
                return c.notFound();
            }

            return c.json(format[0]);
        },
    );

export const formatRouter = new Hono().route('/', formatBase);
export const formatApi = new Hono().route('/', formatBase);
