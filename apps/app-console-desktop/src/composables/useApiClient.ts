import { invoke } from '@tauri-apps/api/core';
import { createConsoleApiClient, useConsolePlatform } from '@tcg-cards/console-platform';

import type { AnyRouter, RouterClient } from '@orpc/server';
import type { ConsoleApiClientContext } from '@tcg-cards/console-platform';

export const PLACEHOLDER_RPC_URL = 'http://desktop.invalid/rpc';

interface DesktopHttpResponse {
  body:    ArrayLike<number>;
  headers: Array<[string, string]>;
  status:  number;
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const source = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  const request = input instanceof Request ? input : null;

  const requestUrl = new URL(source, PLACEHOLDER_RPC_URL);
  const path = `${requestUrl.pathname}${requestUrl.search}`;
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
  const mergedHeaders = new Headers(request?.headers);

  for (const [name, value] of new Headers(init?.headers).entries()) {
    mergedHeaders.set(name, value);
  }

  const headers = [...mergedHeaders.entries()];
  const body = init?.body != null
    ? await readBody(init.body)
    : await readRequestBody(request);

  try {
    const response = await invoke<DesktopHttpResponse>('auth_fetch', {
      path,
      method,
      headers,
      body,
    });

    return new Response(new Uint8Array(response.body), {
      status:  response.status,
      headers: response.headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`RPC request failed: ${message}`);
  }
}

async function readBody(body: RequestInit['body']) {
  if (body == null) {
    return null;
  }

  if (typeof body === 'string') {
    return body;
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  }

  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(body));
  }

  if (ArrayBuffer.isView(body)) {
    return new TextDecoder().decode(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
  }

  throw new Error('Unsupported request body type');
}

async function readRequestBody(request: Request | null) {
  if (request == null || request.body == null) {
    return null;
  }

  return await request.clone().text();
}

export function createDesktopApiClient<TRouter extends AnyRouter>(): RouterClient<TRouter, ConsoleApiClientContext> {
  return createConsoleApiClient<TRouter>({
    url:            PLACEHOLDER_RPC_URL,
    fetch:          authFetch,
    defaultContext: {
      meta: {
        editorRuntime: 'desktop',
        syncMode:      'local_edit',
      },
    },
  });
}

export function useApiClient(): any {
  return useConsolePlatform().api.createClient<AnyRouter>() as any;
}
