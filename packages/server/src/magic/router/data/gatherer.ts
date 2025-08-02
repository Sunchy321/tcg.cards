import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';

import z from 'zod';
import { GathererImageTask } from '@/magic/data/gatherer/image';

export const gathererSSE = new Hono()
    .get(
        '/load-image',
        zValidator('query', z.object({ setId: z.string() })),
        async c => {
            const setId = c.req.valid('query').setId;

            const task = new GathererImageTask(setId);

            return streamSSE(c, async stream => {
                task.bind(stream);

                while (!stream.aborted && !stream.closed) {
                    await stream.sleep(100);
                }
            });
        },
    );
