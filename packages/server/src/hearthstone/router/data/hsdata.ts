import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator as zValidator } from 'hono-openapi/zod';
import { streamSSE } from 'hono/streaming';

import { HonoEnv } from '@/hono-env';

import z from 'zod';

import { clearPatch, PatchListLoader, RepoPuller } from '@/hearthstone/data/hsdata/patch';

export const hsdataRouter = new Hono<HonoEnv>()
    .post(
        '/clear-patch',
        describeRoute({
            description: 'Clear patch data',
            tags:        ['Hearthstone', 'Data', 'Patch'],
            responses:   {
                200: {
                    description: 'Patch data cleared successfully',
                    content:     {
                        'application/json': {
                            schema: resolver(z.object({ success: z.boolean() })),
                        },
                    },
                },
            },
        }),
        zValidator('query', z.object({
            buildNumber: z.preprocess(val => Number.parseInt(val as string, 0), z.int().positive()),
        })),
        async c => {
            const buildNumber = c.req.valid('query').buildNumber;

            await clearPatch(buildNumber);

            return c.json({
                success: true,
            });
        });

export const hsdataSSE = new Hono()
    .get(
        '/pull-repo',
        async c => {
            const task = new RepoPuller();

            return streamSSE(c, async stream => {
                task.bind(stream);

                while (!stream.aborted && !stream.closed) {
                    await stream.sleep(100);
                }
            });
        },
    )
    .get(
        '/load-patch-list',
        async c => {
            const task = new PatchListLoader();

            return streamSSE(c, async stream => {
                task.bind(stream);

                while (!stream.aborted && !stream.closed) {
                    await stream.sleep(100);
                }
            });
        },
    );
