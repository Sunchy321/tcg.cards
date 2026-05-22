import { z } from 'zod';

import { os } from './index';
import {
  hasHearthstonePublishTargetOverride,
  hasHsdataRepoPath,
  hasLocalDatabaseUrl,
  setHearthstonePublishTargetOverride,
  setHsdataRepoPathOverride,
  setLocalDatabaseUrlOverride,
} from '../runtime-config';

/** Runtime status returned by desktop runtime health procedures. */
const runtimeStatus = z.object({
  service:                 z.string(),
  runtime:                 z.string(),
  status:                  z.literal('ok'),
  localDatabaseConfigured: z.boolean(),
  hsdataRepoConfigured:    z.boolean(),
  publishTargetConfigured: z.boolean(),
  time:                    z.string(),
});

/** Standard desktop runtime health payload shared across HTTP and RPC surfaces. */
function buildStatus() {
  return {
    service:                 'service-desktop-runtime',
    runtime:                 'bun',
    status:                  'ok' as const,
    localDatabaseConfigured: hasLocalDatabaseUrl(),
    hsdataRepoConfigured:    hasHsdataRepoPath(),
    publishTargetConfigured: hasHearthstonePublishTargetOverride(),
    time:                    new Date().toISOString(),
  };
}

const configureLocalDatabaseInput = z.strictObject({
  connectionString: z.string().trim().min(1).nullable(),
});

const configureHsdataRepoInput = z.strictObject({
  repoPath: z.string().trim().min(1).nullable(),
});

const configureDesktopStateInput = z.strictObject({
  localDatabase: z.strictObject({
    connectionString: z.string().trim().min(1).nullable(),
  }),
  games: z.strictObject({
    hearthstone: z.strictObject({
      hsdata: z.strictObject({
        repoPath: z.string().trim().min(1).nullable(),
      }),
      publish: z.strictObject({
        publishTargetId: z.string().trim().min(1).nullable(),
        environment: z.string().trim().min(1).nullable(),
        targetFingerprint: z.string().trim().min(1).nullable(),
        connectionString: z.string().trim().min(1).nullable(),
      }),
    }),
  }),
});

/** Applies one desktop runtime configuration snapshot into the current Bun process. */
function applyDesktopState(
  input: z.infer<typeof configureDesktopStateInput>,
) {
  setLocalDatabaseUrlOverride(input.localDatabase.connectionString);
  setHsdataRepoPathOverride(input.games.hearthstone.hsdata.repoPath);
  setHearthstonePublishTargetOverride(input.games.hearthstone.publish);
}

const health = os
  .route({
    method:      'GET',
    description: 'Read one desktop runtime health snapshot',
    tags:        ['Desktop Runtime'],
  })
  .output(runtimeStatus)
  .handler(async () => buildStatus());

const configureLocalDatabase = os
  .route({
    method:      'POST',
    description: 'Configure the local desktop database URL used by runtime-backed tag procedures',
    tags:        ['Desktop Runtime'],
  })
  .input(configureLocalDatabaseInput)
  .output(runtimeStatus)
  .handler(async ({ input }) => {
    setLocalDatabaseUrlOverride(input.connectionString);
    return buildStatus();
  });

const configureHsdataRepo = os
  .route({
    method:      'POST',
    description: 'Configure the local hsdata repository path used by runtime-backed procedures',
    tags:        ['Desktop Runtime'],
  })
  .input(configureHsdataRepoInput)
  .output(runtimeStatus)
  .handler(async ({ input }) => {
    setHsdataRepoPathOverride(input.repoPath);
    return buildStatus();
  });

const configureDesktopState = os
  .route({
    method:      'POST',
    description: 'Configure the desktop runtime from one injected desktop state snapshot',
    tags:        ['Desktop Runtime'],
  })
  .input(configureDesktopStateInput)
  .output(runtimeStatus)
  .handler(async ({ input }) => {
    applyDesktopState(input);
    return buildStatus();
  });

/** Desktop runtime procedures exposed over the local RPC transport. */
export const runtimeRouter = {
  health,
  configureDesktopState,
  configureLocalDatabase,
  configureHsdataRepo,
};
