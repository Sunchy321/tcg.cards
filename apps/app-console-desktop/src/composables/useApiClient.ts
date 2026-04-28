import { computed } from 'vue';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { createConsoleApiClient } from '@tcg-cards/app-console';

import { currentAuthState, getCookieHeader } from '../auth';

import type { AnyRouter, RouterClient } from '@orpc/server';

// Custom fetch that adds auth Cookie header through Tauri's HTTP plugin
async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const cookieHeader = await getCookieHeader();

  const headers = new Headers(init?.headers);
  if (cookieHeader) {
    headers.set('Cookie', cookieHeader);
  }

  return tauriFetch(input as string | URL, {
    ...init,
    headers,
  });
}

export function useApiClient<TRouter extends AnyRouter>(): RouterClient<TRouter> {
  const baseUrl = computed(() => currentAuthState.value?.baseUrl ?? '');

  return createConsoleApiClient<TRouter>({
    url:   `${baseUrl.value}/rpc`,
    fetch: authFetch,
  });
}
