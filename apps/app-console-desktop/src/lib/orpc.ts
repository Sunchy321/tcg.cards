import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';
import type { Router } from 'service-desktop-runtime/orpc';

export const orpc: RouterClient<Router> = createORPCClient(
  new RPCLink({
    url: import.meta.env.VITE_DESKTOP_RUNTIME_RPC_URL ?? 'http://localhost:4318/rpc',
  }),
);
