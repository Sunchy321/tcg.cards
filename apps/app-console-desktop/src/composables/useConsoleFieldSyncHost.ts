import type { WebRouter } from '@tcg-cards/console-api';
import type { ConsoleApi, ConsoleApiClientContext } from '@tcg-cards/console-platform';
import type {
  ConsoleFieldSyncSource,
  WithFieldSyncSource,
} from '@tcg-cards/console-shell/app/composables/field-sync-host';
import type {
  FieldCommitGetInput,
  FieldCommitListInput,
} from '@tcg-cards/model/src/field-commit';
import type {
  TagConflictGetInput,
  TagConflictListInput,
  TagConflictResolveInput,
} from '@tcg-cards/model/src/hearthstone/schema/tag';
import { createConsoleFieldSyncHost } from '@tcg-cards/console-shell/app/composables/field-sync-host';

import { getDesktopDatabaseSettings } from './useDesktopSettings';
import { useDesktopRuntimeClient } from './useDesktopRuntimeClient';

/** Builds the field-sync host that switches between local runtime data and the remote repository. */
export function useDesktopConsoleFieldSyncHost(api: ConsoleApi) {
  const remote = api.createClient<WebRouter>();
  const local = useDesktopRuntimeClient();
  const availableSources = useState<ConsoleFieldSyncSource[]>('desktop-field-sync-available-sources', () => ['remote']);
  const hasProbedSources = useState('desktop-field-sync-available-sources-ready', () => false);

  /** Removes the source selector before one payload is forwarded to the chosen backend. */
  function stripSource<T>(input: WithFieldSyncSource<T>): T {
    const { source: _source, ...rest } = input;
    return rest as T;
  }

  /** Applies remote-edit metadata so remote operations do not inherit desktop local-edit defaults. */
  function withRemoteContext() {
    return {
      context: {
        meta: {
          editorRuntime: 'desktop',
          syncMode:      'remote_edit',
        },
      },
    } satisfies { context: ConsoleApiClientContext };
  }

  /** Probes the desktop runtime once and enables the local source only when the local DB is configured. */
  async function probeAvailableSources() {
    if (hasProbedSources.value) {
      return;
    }

    hasProbedSources.value = true;

    try {
      const settings = await getDesktopDatabaseSettings();
      await local.runtime.configureLocalDatabase({
        connectionString: settings.externalConnectionString,
      });
      const health = await local.runtime.health();
      availableSources.value = health.localDatabaseConfigured
        ? ['local', 'remote']
        : ['remote'];
    } catch {
      availableSources.value = ['remote'];
    }
  }

  if (import.meta.client) {
    void probeAvailableSources();
  }

  return createConsoleFieldSyncHost({
    getAvailableSources() {
      return availableSources.value;
    },

    async listTagCommits(input: WithFieldSyncSource<FieldCommitListInput>) {
      const payload = stripSource(input);
      if (input.source === 'local') {
        return await local.tag.listCommits(payload);
      }

      return await remote.hearthstone.tag.listCommits(payload, withRemoteContext());
    },

    async getTagCommit(input: WithFieldSyncSource<FieldCommitGetInput>) {
      const payload = stripSource(input);
      if (input.source === 'local') {
        return await local.tag.getCommit(payload);
      }

      return await remote.hearthstone.tag.getCommit(payload, withRemoteContext());
    },

    async listTagConflicts(input: WithFieldSyncSource<TagConflictListInput>) {
      const payload = stripSource(input);
      if (input.source === 'local') {
        return await local.tag.listConflicts(payload);
      }

      return await remote.hearthstone.tag.listConflicts(payload, withRemoteContext());
    },

    async getTagConflict(input: WithFieldSyncSource<TagConflictGetInput>) {
      const payload = stripSource(input);
      if (input.source === 'local') {
        return await local.tag.getConflict(payload);
      }

      return await remote.hearthstone.tag.getConflict(payload, withRemoteContext());
    },

    async resolveTagConflict(input: WithFieldSyncSource<TagConflictResolveInput>) {
      const payload = stripSource(input);
      if (input.source === 'local') {
        return await local.tag.resolveConflict(payload);
      }

      return await remote.hearthstone.tag.resolveConflict(payload, withRemoteContext());
    },
  });
}
