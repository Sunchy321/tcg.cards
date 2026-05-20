import { createConsoleFieldSyncHost } from '@tcg-cards/console-shell/app/composables/field-sync-host';

import type { ConsoleApi } from '@tcg-cards/console-platform';
import type { WebRouter } from '@tcg-cards/console-api';
import type {
  ConsoleFieldSyncSource,
  WithFieldSyncSource,
} from '@tcg-cards/console-shell/app/composables/field-sync-host';
import type {
  TagConflictGetInput,
  TagConflictListInput,
  TagConflictResolveInput,
} from '@tcg-cards/model/src/hearthstone/schema/tag';
import type {
  FieldCommitGetInput,
  FieldCommitListInput,
} from '@tcg-cards/model/src/field-commit';

/** Builds the field-sync host that exposes only remote repository data on the site console. */
export function useSiteConsoleFieldSyncHost(api: ConsoleApi) {
  const remote = api.createClient<WebRouter>();

  /** Removes the source selector before one payload is forwarded to the remote API. */
  function stripSource<T>(input: WithFieldSyncSource<T>): T {
    const { source: _source, ...rest } = input;
    return rest as T;
  }

  /** Rejects any source other than the site-supported remote repository. */
  function assertRemote(source: ConsoleFieldSyncSource) {
    if (source !== 'remote') {
      throw new Error('Site console only supports the remote field-sync source');
    }
  }

  return createConsoleFieldSyncHost({
    getAvailableSources() {
      return ['remote'];
    },

    async listTagCommits(input: WithFieldSyncSource<FieldCommitListInput>) {
      assertRemote(input.source);
      return await remote.hearthstone.tag.listCommits(stripSource(input));
    },

    async getTagCommit(input: WithFieldSyncSource<FieldCommitGetInput>) {
      assertRemote(input.source);
      return await remote.hearthstone.tag.getCommit(stripSource(input));
    },

    async listTagConflicts(input: WithFieldSyncSource<TagConflictListInput>) {
      assertRemote(input.source);
      return await remote.hearthstone.tag.listConflicts(stripSource(input));
    },

    async getTagConflict(input: WithFieldSyncSource<TagConflictGetInput>) {
      assertRemote(input.source);
      return await remote.hearthstone.tag.getConflict(stripSource(input));
    },

    async resolveTagConflict(input: WithFieldSyncSource<TagConflictResolveInput>) {
      assertRemote(input.source);
      return await remote.hearthstone.tag.resolveConflict(stripSource(input));
    },
  });
}
