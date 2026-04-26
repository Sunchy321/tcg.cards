import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

import type { RouterClient } from '@orpc/server';

export * from './error';
export * from './layout';

export interface CreateConsoleApiClientOptions {
  url: string;
  headers?: ConstructorParameters<typeof RPCLink>[0]['headers'];
}

export function createConsoleApiClient<TRouter>(
  options: CreateConsoleApiClientOptions,
): RouterClient<TRouter> {
  const link = new RPCLink({
    url: options.url,
    headers: options.headers,
  });

  return createORPCClient(link) as RouterClient<TRouter>;
}
