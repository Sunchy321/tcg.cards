import type { InjectionKey } from 'vue';
import { inject, provide } from '#imports';

import type {
  FieldCommitGetInput,
  FieldCommitListInput,
  FieldCommitListResult,
  FieldCommitProfile,
} from '@tcg-cards/model/src/field-commit';
import type {
  TagConflictGetInput,
  TagConflictListInput,
  TagConflictListResult,
  TagConflictProfile,
  TagConflictResolveInput,
} from '@tcg-cards/model/src/hearthstone/schema/tag';

/** Distinguishes the remote shared repository from one desktop-local repository. */
export type ConsoleFieldSyncSource = 'local' | 'remote';

/** Attaches one field-sync source selector to an existing payload shape. */
export type WithFieldSyncSource<T> = T & { source: ConsoleFieldSyncSource };

/** Provides commit and conflict data for the shared field-sync admin pages. */
export interface ConsoleFieldSyncHost {
  getAvailableSources(): ConsoleFieldSyncSource[];
  listTagCommits(input: WithFieldSyncSource<FieldCommitListInput>): Promise<FieldCommitListResult> | FieldCommitListResult;
  getTagCommit(input: WithFieldSyncSource<FieldCommitGetInput>): Promise<FieldCommitProfile> | FieldCommitProfile;
  listTagConflicts(input: WithFieldSyncSource<TagConflictListInput>): Promise<TagConflictListResult> | TagConflictListResult;
  getTagConflict(input: WithFieldSyncSource<TagConflictGetInput>): Promise<TagConflictProfile> | TagConflictProfile;
  resolveTagConflict(input: WithFieldSyncSource<TagConflictResolveInput>): Promise<TagConflictProfile> | TagConflictProfile;
}

export const consoleFieldSyncHostKey: InjectionKey<ConsoleFieldSyncHost> = Symbol('console-field-sync-host');

/** Normalizes one field-sync host object before it is provided to the app tree. */
export function createConsoleFieldSyncHost(
  host: ConsoleFieldSyncHost,
): ConsoleFieldSyncHost {
  return host;
}

/** Provides one field-sync host for shared admin pages in the current app tree. */
export function provideConsoleFieldSyncHost(host: ConsoleFieldSyncHost): ConsoleFieldSyncHost {
  provide(consoleFieldSyncHostKey, host);
  return host;
}

/** Reads the current field-sync host from the nearest provider. */
export function useConsoleFieldSyncHost(): ConsoleFieldSyncHost {
  const host = inject(consoleFieldSyncHostKey, null);

  if (!host) {
    throw new Error('Console field sync host is not provided');
  }

  return host;
}
