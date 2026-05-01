import { inject, provide, type InjectionKey } from 'vue';

import type { AnyRouter, RouterClient } from '@orpc/server';

export interface ConsoleApi {
  request(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  createClient<TRouter extends AnyRouter>(): RouterClient<TRouter>;
}

export interface ConsoleRouter {
  currentPath(): string;
  push(path: string): Promise<void> | void;
  replace(path: string): Promise<void> | void;
}

export interface ConsoleSession<TSession = unknown> {
  get(): TSession | null;
  set(session: TSession | null): void;
}

export interface ConsoleStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface ConsoleToastInput {
  title: string;
  description?: string;
  color?: 'error' | 'info' | 'primary' | 'success' | 'warning';
}

export interface ConsoleToast {
  show(input: ConsoleToastInput): void;
}

export interface ConsolePlatform<TSession = unknown> {
  api: ConsoleApi;
  router: ConsoleRouter;
  session: ConsoleSession<TSession>;
  storage: ConsoleStorage;
  toast: ConsoleToast;
}

export const consolePlatformKey: InjectionKey<ConsolePlatform<unknown>> = Symbol('console-platform');

export function createConsolePlatform<TSession>(
  platform: ConsolePlatform<TSession>,
): ConsolePlatform<TSession> {
  return platform;
}

export function createConsoleSession<TSession>(options: {
  get(): TSession | null;
  set?(session: TSession | null): void;
}): ConsoleSession<TSession> {
  return {
    get: options.get,
    set(session) {
      options.set?.(session);
    },
  };
}

export function createConsoleStorage(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): ConsoleStorage {
  return {
    get(key) {
      return storage.getItem(key);
    },
    set(key, value) {
      storage.setItem(key, value);
    },
    remove(key) {
      storage.removeItem(key);
    },
  };
}

export function createMemoryStorage(): ConsoleStorage {
  const values = new Map<string, string>();

  return {
    get(key) {
      return values.get(key) ?? null;
    },
    set(key, value) {
      values.set(key, value);
    },
    remove(key) {
      values.delete(key);
    },
  };
}

export function provideConsolePlatform<TSession>(
  platform: ConsolePlatform<TSession>,
): ConsolePlatform<TSession> {
  provide(consolePlatformKey, platform as ConsolePlatform<unknown>);
  return platform;
}

export function useConsolePlatform<TSession = unknown>(): ConsolePlatform<TSession> {
  const platform = inject(consolePlatformKey, null);

  if (!platform) {
    throw new Error('Console platform is not provided');
  }

  return platform as ConsolePlatform<TSession>;
}
