import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

import type { RouterClient } from '@orpc/server';
import type { Router } from 'service-desktop-runtime/orpc';

const defaultDesktopRuntimeRpcUrl = 'http://localhost:4318/rpc';

/** Resolves the desktop runtime RPC base URL from the current frontend environment. */
export function readDesktopRuntimeRpcUrl() {
  const value = import.meta.env.VITE_DESKTOP_RUNTIME_RPC_URL;
  return value && value.trim().length > 0 ? value : defaultDesktopRuntimeRpcUrl;
}

/** Creates one typed oRPC client bound to the local desktop runtime HTTP endpoint. */
export function createDesktopRuntimeClient(): RouterClient<Router> {
  const link = new RPCLink({
    url: readDesktopRuntimeRpcUrl(),
  });

  return createORPCClient(link);
}

/** Returns the shared desktop runtime client used by the current frontend instance. */
export function useDesktopRuntimeClient() {
  return useState('desktop-runtime-client', () => createDesktopRuntimeClient()).value;
}
