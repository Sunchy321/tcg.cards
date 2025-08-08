import { Hono } from 'hono';
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

            return task.bind(c);
        },
    );
