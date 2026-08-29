import { z } from 'zod';

import { os } from './index';
import { getGamePathState, isExplicitPath, resolvePath } from '../lib/game-paths';
import {
  applyPathOverrides,
  hasAiConfig,
  hasHearthstoneImageOverride,
  hasHearthstonePublishTargetOverride,
  hasLocalDatabaseUrl,
  hasYugiohImageOverride,
  hasYugiohPublishTargetOverride,
  readAllPathOverrides,
  setAiConfig,
  setEditorIdentity,
  setHearthstoneImageOverride,
  setHearthstonePublishTargetOverrides,
  setLocalDatabaseUrlOverride,
  setPathOverride,
  setYugiohImageOverride,
  setYugiohPublishTargetOverride,
  type PathOverrides,
} from '../runtime-config';

/** Runtime status returned by desktop runtime health procedures. */
const runtimeStatus = z.object({
  service:                 z.string(),
  runtime:                 z.string(),
  status:                  z.literal('ok'),
  localDatabaseConfigured: z.boolean(),
  pathsConfigured:         z.boolean(),
  imageConfigured:         z.boolean(),
  publishTargetConfigured: z.boolean(),
  yugiohPublishTargetConfigured: z.boolean(),
  yugiohImageConfigured:   z.boolean(),
  aiConfigured:            z.boolean(),
  time:                    z.string(),
});

/** Standard desktop runtime health payload shared across HTTP and RPC surfaces. */
function buildStatus() {
  return {
    service:                 'service-desktop-runtime',
    runtime:                 'bun',
    status:                  'ok' as const,
    localDatabaseConfigured: hasLocalDatabaseUrl(),
    pathsConfigured:         Object.keys(readAllPathOverrides()).length > 0,
    imageConfigured:         hasHearthstoneImageOverride(),
    publishTargetConfigured: hasHearthstonePublishTargetOverride(),
    yugiohPublishTargetConfigured: hasYugiohPublishTargetOverride(),
    yugiohImageConfigured:   hasYugiohImageOverride(),
    aiConfigured:            hasAiConfig(),
    time:                    new Date().toISOString(),
  };
}

const configureLocalDatabaseInput = z.strictObject({
  connectionString: z.string().trim().min(1).nullable(),
});

const configurePathInput = z.strictObject({
  key:   z.string().trim().min(1),
  value: z.string().trim().min(1).nullable(),
});

const pathNodeSchema: z.ZodType<string | Record<string, unknown>> = z.lazy(() =>
  z.union([z.string(), z.record(z.string(), pathNodeSchema)]),
);

const configureDesktopStateInput = z.strictObject({
  localDatabase: z.strictObject({
    connectionString: z.string().trim().min(1).nullable(),
  }),
  paths: z.record(z.string(), pathNodeSchema),
  games: z.strictObject({
    hearthstone: z.strictObject({
      image: z.strictObject({
        rendererBaseUrl: z.string().trim().min(1).nullable(),
        bucketDir:       z.string().trim().min(1).nullable(),
      }),
      publish: z.array(z.strictObject({
        publishTarget:     z.string().trim().min(1).nullable(),
        environment:       z.string().trim().min(1).nullable(),
        targetFingerprint: z.string().trim().min(1).nullable(),
        connectionString:  z.string().trim().min(1).nullable(),
      })),
    }),
    yugioh: z.strictObject({
      image: z.strictObject({
        bucketDir: z.string().trim().min(1).nullable(),
      }),
      publish: z.strictObject({
        publishTargetId: z.string().trim().min(1).nullable(),
        environment: z.string().trim().min(1).nullable(),
        targetFingerprint: z.string().trim().min(1).nullable(),
        connectionString: z.string().trim().min(1).nullable(),
      }),
    }),
  }),
  ai: z.strictObject({
    apiKey:  z.string().trim().min(1).nullable(),
    baseUrl: z.string().trim().min(1).nullable(),
    model:   z.string().trim().min(1).nullable(),
  }).optional(),
});

/** Applies one desktop runtime configuration snapshot into the current Bun process. */
function applyDesktopState(
  input: z.infer<typeof configureDesktopStateInput>,
) {
  setLocalDatabaseUrlOverride(input.localDatabase.connectionString);
  applyPathOverrides(input.paths as PathOverrides);
  setHearthstoneImageOverride(input.games.hearthstone.image);
  setHearthstonePublishTargetOverrides(input.games.hearthstone.publish);
  setYugiohImageOverride(input.games.yugioh.image);
  setYugiohPublishTargetOverride(input.games.yugioh.publish);
  if (input.ai) {
    setAiConfig({
      apiKey:  input.ai.apiKey,
      baseUrl: input.ai.baseUrl,
      model:   input.ai.model,
    });
  }
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

const configurePath = os
  .route({
    method:      'POST',
    description: 'Configure one runtime-local path override for a dotted `{game}.{ns}.{leaf}` key',
    tags:        ['Desktop Runtime'],
  })
  .input(configurePathInput)
  .output(runtimeStatus)
  .handler(async ({ input }) => {
    setPathOverride(input.key, input.value);
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

const gamePathLeafState = z.strictObject({
  name:     z.string(),
  label:    z.string(),
  path:     z.string().nullable(),
  explicit: z.boolean(),
});

const gamePathState = z.strictObject({
  game:  z.string(),
  data:  z.strictObject({ root: z.string().nullable(), rootExplicit: z.boolean(), leaves: z.array(gamePathLeafState) }),
  image: z.strictObject({ root: z.string().nullable(), rootExplicit: z.boolean(), leaves: z.array(gamePathLeafState) }),
});

const getGamePathStateInput = z.strictObject({
  game: z.string().trim().min(1),
});

const getGamePathStateProcedure = os
  .route({
    method:      'GET',
    description: 'Read one game’s declared data/image leaves with their effective paths',
    tags:        ['Desktop Runtime'],
  })
  .input(getGamePathStateInput)
  .output(gamePathState)
  .handler(async ({ input }) => getGamePathState(input.game));

const getPathInput = z.strictObject({
  key: z.string().trim().min(1),
});

const getPathResult = z.strictObject({
  key:      z.string(),
  path:     z.string().nullable(),
  explicit: z.boolean(),
});

const getPath = os
  .route({
    method:      'GET',
    description: 'Read the effective path for one dotted `{game}.{ns}.{leaf}` key',
    tags:        ['Desktop Runtime'],
  })
  .input(getPathInput)
  .output(getPathResult)
  .handler(async ({ input }) => ({
    key:      input.key,
    path:     resolvePath(input.key),
    explicit: isExplicitPath(input.key),
  }));

/** Desktop runtime procedures exposed over the local RPC transport. */
export const runtimeRouter = {
  health,
  configureDesktopState,
  configureEditorIdentity,
  configureLocalDatabase,
  configurePath,
  openPath,
  getGamePathState: getGamePathStateProcedure,
  getPath,
};
