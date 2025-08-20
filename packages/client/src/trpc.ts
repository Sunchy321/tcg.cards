import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { BatchLinkPlugin } from '@orpc/client/plugins';

import type { TRPC } from '@server/service';
import type { RouterClient } from '@orpc/server';

const link = new RPCLink({
    url:     import.meta.env.VITE_TRPC_URL ?? 'http://localhost:3000/trpc',
    plugins: [
        new BatchLinkPlugin({
            groups: [
                {
                    condition: () => true,
                    context:   {}, // Context used for the rest of the request lifecycle
                },
            ],
        }),
    ],
    fetch: (request, init) => {
        return globalThis.fetch(request, {
            ...init,
            credentials: 'include', // Include cookies for cross-origin requests
        });
    },
});

export const trpc: RouterClient<TRPC> = createORPCClient(link);
