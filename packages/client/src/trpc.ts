import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';

import type { AppRouter } from '@server/router';

const url = import.meta.env.VITE_TRPC_URL;

export const trpc = createTRPCProxyClient<AppRouter>({
    links: [httpBatchLink({ url })],
});
