import { z } from 'zod';

import { os } from './index';

/** Runtime status returned by desktop runtime health procedures. */
const runtimeStatus = z.object({
  service: z.string(),
  runtime: z.string(),
  status:  z.literal('ok'),
  time:    z.string(),
});

/** Standard desktop runtime health payload shared across HTTP and RPC surfaces. */
function buildStatus() {
  return {
    service: 'service-desktop-runtime',
    runtime: 'bun',
    status:  'ok' as const,
    time:    new Date().toISOString(),
  };
}

/** Desktop runtime procedures exposed over the local RPC transport. */
export const runtimeRouter = {
  health: os
    .route({
      method:      'GET',
      description: 'Read one desktop runtime health snapshot',
      tags:        ['Desktop Runtime'],
    })
    .output(runtimeStatus)
    .handler(async () => buildStatus()),
};
