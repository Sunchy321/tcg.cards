import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator as zValidator } from 'hono-openapi/zod';

import z from 'zod';

import { eq } from 'drizzle-orm';

import { Patch } from '../schema/patch';

import { db } from '@/drizzle';
import { patchSchema } from '@model/hearthstone/schema/patch';

export const patchRouter = new Hono()
    .get(
        '/list',
        describeRoute({
            description: 'List all patches',
            tags:        ['Hearthstone', 'Patch'],
            responses:   {
                200: {
                    description: 'List of patches',
                    content:     {
                        'application/json': {
                            schema: resolver(patchSchema.array()),
                        },
                    },
                },
            },
        }),
        async c => {
            const patches = await db.select().from(Patch).orderBy(Patch.buildNumber);

            return c.json(patches);
        },
    )
    .get(
        '/full',
        describeRoute({
            description: 'Get full patch information',
            tags:        ['Hearthstone', 'Patch'],
            responses:   {
                200: {
                    description: 'Full patch information',
                    content:     {
                        'application/json': {
                            schema: resolver(patchSchema),
                        },
                    },
                },
            },
        }),
        zValidator('query', z.object({
            buildNumber: z.string().transform(val => parseInt(val, 10)).pipe(z.int().positive()).describe('Build number of the patch'),
        })),
        async c => {
            const { buildNumber } = c.req.valid('query');

            const patch = await db
                .select()
                .from(Patch)
                .where(eq(Patch.buildNumber, buildNumber))
                .limit(1)
                .then(rows => rows[0]);

            if (!patch) {
                return c.notFound();
            }

            return c.json(patch);
        },
    );
