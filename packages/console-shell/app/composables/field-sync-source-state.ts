import { computed, ref, watch } from 'vue';

import { useConsolePlatform } from '@tcg-cards/console-platform';

import { useConsoleFieldSyncHost, type ConsoleFieldSyncSource } from './field-sync-host';

const fieldSyncSourceStorageKeyPrefix = 'console-field-sync-source';

/** Persists one field-sync page source selection while respecting host-supported sources. */
export function useConsoleFieldSyncSourceState(scope: string) {
  const platform = useConsolePlatform();
  const host = useConsoleFieldSyncHost();
  const sources = computed(() => host.getAvailableSources());
  const storageKey = `${fieldSyncSourceStorageKeyPrefix}:${scope}`;

  /** Reads one stored source when it is still supported by the current host. */
  function readStoredSource() {
    const value = platform.storage.get(storageKey);
    return value === 'local' || value === 'remote'
      ? sources.value.find(source => source === value) ?? null
      : null;
  }

  /** Resolves the initial source shown by one field-sync page. */
  function resolveInitialSource(): ConsoleFieldSyncSource {
    return readStoredSource() ?? sources.value[0] ?? 'remote';
  }

  /** Writes one source selection back into storage when switching is meaningful. */
  function persistSource(value: ConsoleFieldSyncSource) {
    if (sources.value.length <= 1) {
      platform.storage.remove(storageKey);
      return;
    }

    platform.storage.set(storageKey, value);
  }

  const source = ref<ConsoleFieldSyncSource>(resolveInitialSource());

  /** Updates the current source and keeps the persisted selection in sync. */
  function setSource(value: ConsoleFieldSyncSource) {
    if (!sources.value.includes(value)) {
      return;
    }

    source.value = value;
    persistSource(value);
  }

  persistSource(source.value);

  watch(sources, nextSources => {
    if (nextSources.includes(source.value)) {
      persistSource(source.value);
      return;
    }

    source.value = nextSources[0] ?? 'remote';
    persistSource(source.value);
  }, { immediate: true });

  return {
    source,
    sources,
    setSource,
  };
}
