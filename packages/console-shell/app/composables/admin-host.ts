import type { InjectionKey } from 'vue';
import { inject, provide } from '#imports';
import type { Game } from '@tcg-cards/base';

/** Management lifecycle and optional local game access supplied by a host. */
export interface ConsoleAdminHost {
  localGames?: readonly Game[];
  initialize?(): Promise<void> | void;
  signOut(): Promise<void> | void;
}

export const consoleAdminHostKey: InjectionKey<ConsoleAdminHost> = Symbol('console-admin-host');

export function createConsoleAdminHost(
  host: ConsoleAdminHost,
): ConsoleAdminHost {
  return host;
}

export function provideConsoleAdminHost(host: ConsoleAdminHost): ConsoleAdminHost {
  provide(consoleAdminHostKey, host);
  return host;
}

export function useConsoleAdminHost(): ConsoleAdminHost {
  const host = inject(consoleAdminHostKey, null);

  if (!host) {
    throw new Error('Console admin host is not provided');
  }

  return host;
}
