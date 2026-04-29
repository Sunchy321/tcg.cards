import { invoke } from '@tauri-apps/api/core';
import { createConsoleApiClient } from '@tcg-cards/app-console';

import type { AnyRouter, RouterClient } from '@orpc/server';

const PLACEHOLDER_RPC_URL = 'http://desktop.invalid/rpc';

interface DesktopHttpResponse {
  body: ArrayLike<number>;
  headers: Array<[string, string]>;
  status: number;
}

async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const source = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;

  const requestUrl = new URL(source, PLACEHOLDER_RPC_URL);
  const path = `${requestUrl.pathname}${requestUrl.search}`;
  const method = init?.method?.toUpperCase() ?? 'GET';
  const headers = [...new Headers(init?.headers).entries()];
  const body = await readBody(init?.body);

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

export function useApiClient<TRouter extends AnyRouter>(): RouterClient<TRouter> {
  return createConsoleApiClient<TRouter>({
    url:   PLACEHOLDER_RPC_URL,
    fetch: authFetch,
  });
}
