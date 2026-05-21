import { z } from 'zod';

import { os } from './index';
import {
  hasHsdataRepoPath,
  hasLocalDatabaseUrl,
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
    time:                    new Date().toISOString(),
  };
}

const configureLocalDatabaseInput = z.strictObject({
  connectionString: z.string().trim().min(1).nullable(),
});

const configureHsdataRepoInput = z.strictObject({
  repoPath: z.string().trim().min(1).nullable(),
});

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

/** Desktop runtime procedures exposed over the local RPC transport. */
export const runtimeRouter = {
  health,
  configureLocalDatabase,
  configureHsdataRepo,
};
