import { z } from 'zod';

import { os } from './index';
import {
  hasHearthstoneImageOverride,
  hasHearthstonePublishTargetOverride,
  hasHsdataRepoPath,
  hasLocalDatabaseUrl,
  setEditorIdentity,
  setHearthstoneImageOverride,
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
  imageConfigured:         z.boolean(),
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
    imageConfigured:         hasHearthstoneImageOverride(),
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
      image: z.strictObject({
        rendererBaseUrl: z.string().trim().min(1).nullable(),
        bucketDir: z.string().trim().min(1).nullable(),
      }),
      publish: z.strictObject({
        publishTarget: z.string().trim().min(1).nullable(),
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
  setHearthstoneImageOverride(input.games.hearthstone.image);
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

const openPathInput = z.strictObject({
  path: z.string().trim().min(1),
});

const openPathResult = z.strictObject({
  ok: z.boolean(),
});

/** Opens a file or directory in the OS-native file manager. */
function getOpenCommand() {
  if (process.platform === 'darwin') return 'open';
  if (process.platform === 'win32') return 'explorer';
  return 'xdg-open';
}

const openPath = os
  .route({
    method:      'POST',
    description: 'Open a file or directory path in the OS-native file manager',
    tags:        ['Desktop Runtime'],
  })
  .input(openPathInput)
  .output(openPathResult)
  .handler(async ({ input }) => {
    const cmd = getOpenCommand();
    const proc = Bun.spawn([cmd, input.path], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await proc.exited;
    return { ok: proc.exitCode === 0 };
  });

const configureEditorIdentityInput = z.strictObject({
  editorIdentity: z.string().trim().min(1),
});

const configureEditorIdentity = os
  .route({
    method:      'POST',
    description: 'Set the editor identity used by tag commit operations',
    tags:        ['Desktop Runtime'],
  })
  .input(configureEditorIdentityInput)
  .output(z.strictObject({ ok: z.boolean() }))
  .handler(async ({ input }) => {
    setEditorIdentity(input.editorIdentity);
    return { ok: true };
  });

/** Desktop runtime procedures exposed over the local RPC transport. */
export const runtimeRouter = {
  health,
  configureDesktopState,
  configureEditorIdentity,
  configureLocalDatabase,
  configureHsdataRepo,
  openPath,
};
