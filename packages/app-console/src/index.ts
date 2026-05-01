import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

import type { AnyRouter, RouterClient } from '@orpc/server';

export * from '@tcg-cards/console-core';
export type { Game } from '@tcg-cards/shared';

export interface CreateConsoleApiClientOptions {
  url: string;
  headers?: ConstructorParameters<typeof RPCLink>[0]['headers'];
  fetch?: ConstructorParameters<typeof RPCLink>[0]['fetch'];
}

export function createConsoleApiClient<TRouter extends AnyRouter>(
  options: CreateConsoleApiClientOptions,
): RouterClient<TRouter> {
  const link = new RPCLink({
    url:     options.url,
    headers: options.headers,
    fetch:   options.fetch,
  });

  return createORPCClient(link) as RouterClient<TRouter>;
}
