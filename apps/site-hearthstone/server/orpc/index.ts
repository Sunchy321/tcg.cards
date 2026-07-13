import { os as create } from '@orpc/server';

import type { HonoEnv } from './hono-env';

export const os = create
  .$context<HonoEnv['Variables']>();
