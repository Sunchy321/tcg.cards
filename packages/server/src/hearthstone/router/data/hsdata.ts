import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import { PatchListLoader, RepoPuller } from '@/hearthstone/data/hsdata/patch';

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
