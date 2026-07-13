import { globalConfig, hearthstoneConfig, magicConfig } from '@tcg-cards/model/src/user-config';
import type { GlobalConfig } from '@tcg-cards/model/src/user-config';
import type { z } from 'zod';

declare const authClient: { useSession(): { data: Ref<{ user: { id: string } | null } | null> } };

const configSchemas: Record<string, z.ZodType> = {
  global:      globalConfig,
  hearthstone: hearthstoneConfig,
  magic:       magicConfig,
};

function getDefaultConfig<T>(schema: z.ZodType<T>): T {
  const result = schema.safeParse({});
  if (result.success) return result.data;
  return {} as T;
}

function mergeDefaults<T>(raw: unknown, schema: z.ZodType<T>): T {
  const result = schema.safeParse(raw ?? {});
  if (result.success) return result.data;
  return getDefaultConfig(schema);
}

type SyncStatus = 'synced' | 'syncing' | 'unsaved' | 'failed';

// ── Shared state (module-level, one per game) ─────────────────────────────────

const gameConfigState: Record<string, Ref<Record<string, unknown> | null>> = {};
const gameSyncState: Record<string, Ref<SyncStatus | null>> = {};
const gameSyncDone: Record<string, boolean> = {};
const pushTimers: Record<string, ReturnType<typeof setTimeout> | null> = {};

function getConfigRef(gameId: string): Ref<Record<string, unknown> | null> {
  if (!gameConfigState[gameId]) {
    gameConfigState[gameId] = ref<Record<string, unknown> | null>(null);
    if (import.meta.client) {
      const stored = localStorage.getItem(`tcg_config`);
      gameConfigState[gameId].value = stored ? JSON.parse(stored) : null;
    }
  }
  return gameConfigState[gameId];
}

function getSyncRef(gameId: string): Ref<SyncStatus | null> {
  if (!gameSyncState[gameId]) {
    gameSyncState[gameId] = ref<SyncStatus | null>(null);
  }
  return gameSyncState[gameId];
}

function safeUseAuth() {
  try {
    return authClient.useSession();
  } catch {
    return undefined;
  }
}

// ── useGlobalConfig ────────────────────────────────────────────────────────────

export function useGlobalConfig() {
  const session = safeUseAuth();
  const appConfig = useAppConfig();
  const gameId = appConfig.gameId as string;

  const globalCookie = useCookie(`tcg_global_config`, {
    default: () => null,
    maxAge:  60 * 60 * 24 * 365,
  });

  const config = computed(() =>
    mergeDefaults(globalCookie.value, globalConfig),
  ) as ComputedRef<GlobalConfig>;

  const syncStatus = getSyncRef('global');

  const { $orpc } = useNuxtApp() as any;

  function writeLocal(data: Record<string, unknown>) {
    (globalCookie as unknown as Ref<Record<string, unknown>>).value = data;
  }

  function debouncedPush(data: Record<string, unknown>) {
    if (!session?.data?.value?.user) return;
    if (pushTimers['global']) clearTimeout(pushTimers['global']!);
    pushTimers['global'] = setTimeout(async () => {
      syncStatus.value = 'unsaved';
      try {
        await $orpc[gameId].userConfig.put({ gameId: 'global', config: data });
        syncStatus.value = 'synced';
      } catch {
        syncStatus.value = 'failed';
      }
    }, 1000);
  }

  if (import.meta.client && session && !gameSyncDone['global']) {
    gameSyncDone['global'] = true;
    watch(() => session.data?.value?.user, async user => {
      if (user == null) return;

      syncStatus.value = 'syncing';

      try {
        const remote = await $orpc[gameId].userConfig.get({ gameId: 'global' });

        if (remote != null) {
          const merged = { ...config.value, ...remote };
          writeLocal(mergeDefaults(merged, globalConfig));
        } else {
          const parsed = mergeDefaults(config.value, globalConfig);
          writeLocal(parsed);
          await $orpc[gameId].userConfig.put({ gameId: 'global', config: parsed });
        }
        syncStatus.value = 'synced';
      } catch {
        syncStatus.value = 'failed';
      }
    }, { immediate: true });
  }

  function setConfig(key: string, value: unknown) {
    const current = { ...config.value, [key]: value };
    writeLocal(current);
    debouncedPush(current);
  }

  return {
    config,
    setConfig,
    syncStatus: computed(() => syncStatus.value),
  };
}

// ── useUserConfig ──────────────────────────────────────────────────────────────

export function useUserConfig<TConfig extends Record<string, unknown> = Record<string, unknown>>(gameId?: string) {
  const appConfig = useAppConfig();
  const resolvedGameId = gameId ?? appConfig.gameId as string;

  const schema = configSchemas[resolvedGameId];
  if (!schema) {
    throw new Error(`useUserConfig: no schema for game "${resolvedGameId}"`);
  }

  const session = safeUseAuth();
  const rawLocal = getConfigRef(resolvedGameId);
  const syncStatus = getSyncRef(resolvedGameId);

  const { $orpc } = useNuxtApp() as any;

  const config = computed(() =>
    mergeDefaults(rawLocal.value, schema),
  ) as ComputedRef<TConfig>;

  function writeLocal(data: unknown) {
    rawLocal.value = data as Record<string, unknown>;
    if (import.meta.client) {
      localStorage.setItem(`tcg_config`, JSON.stringify(data));
    }
  }

  function debouncedPush(data: unknown) {
    if (!session?.data?.value?.user) return;
    if (pushTimers[resolvedGameId]) clearTimeout(pushTimers[resolvedGameId]!);
    pushTimers[resolvedGameId] = setTimeout(async () => {
      syncStatus.value = 'unsaved';
      try {
        await $orpc[resolvedGameId].userConfig.put({ gameId: resolvedGameId, config: data });
        syncStatus.value = 'synced';
      } catch {
        syncStatus.value = 'failed';
      }
    }, 1000);
  }

  if (import.meta.client && session && !gameSyncDone[resolvedGameId]) {
    gameSyncDone[resolvedGameId] = true;
    watch(() => session.data?.value?.user, async user => {
      if (user == null) return;

      syncStatus.value = 'syncing';

      try {
        const remote = await $orpc[resolvedGameId].userConfig.get({ gameId: resolvedGameId });

        if (remote != null) {
          const merged = { ...config.value, ...remote };
          writeLocal(mergeDefaults(merged, schema));
        } else {
          const parsed = mergeDefaults(config.value, schema);
          writeLocal(parsed);
          await $orpc[resolvedGameId].userConfig.put({ gameId: resolvedGameId, config: parsed });
        }
        syncStatus.value = 'synced';
      } catch {
        syncStatus.value = 'failed';
      }
    }, { immediate: true });
  }

  function setConfig(key: string, value: unknown) {
    const current = { ...config.value, [key]: value };
    writeLocal(current);
    debouncedPush(current);

    // Sync locale to global gameLocales
    if (key === 'locale' && typeof value === 'string') {
      const { config: globalCfg, setConfig: setGlobal } = useGlobalConfig();
      setGlobal('gameLocales', {
        ...globalCfg.value.gameLocales,
        [resolvedGameId]: value,
      });
    }
  }

  return {
    config,
    setConfig,
    syncStatus: computed(() => syncStatus.value),
  };
}
