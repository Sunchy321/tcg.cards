import { os } from '../index';
import { z } from 'zod';
import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { inArray } from 'drizzle-orm';

import { getLocalDb } from '../../lib/hearthstone/hsdata-local-db';
import { PatchState } from '@tcg-cards/db/schema/local/hearthstone';

const WORKSPACE = resolve(import.meta.dir, '..', '..', '..', '..', '..', '..');
const UNPACK_DIR = resolve(WORKSPACE, 'data', 'hearthstone', 'unpack');

const buildInfo = z.object({
  buildNumber: z.number(),
  fileName:    z.string(),
  size:        z.number(),
});

const listUnpackBuilds = os
  .route({
    method:      'GET',
    description: 'List available unpack ZIP build files',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Unpack'],
  })
  .output(z.array(buildInfo))
  .handler(async () => {
    const builds: Array<{ buildNumber: number, fileName: string, size: number }> = [];

    try {
      const files = readdirSync(UNPACK_DIR).filter(f => f.endsWith('.zip'));
      for (const file of files) {
        const num = Number(file.replace('.zip', ''));
        if (!Number.isSafeInteger(num) || num <= 0) continue;
        const stats = statSync(resolve(UNPACK_DIR, file));
        builds.push({ buildNumber: num, fileName: file, size: stats.size });
      }
    } catch {
      // Directory doesn't exist — return empty
    }

    builds.sort((a, b) => b.buildNumber - a.buildNumber);
    return builds;
  });

const resetUnpackStatusInput = z.object({
  sourceTags: z.array(z.number().int().nonnegative()).min(1),
});

const resetUnpackStatus = os
  .route({
    method:      'POST',
    description: 'Reset unpack status for selected sourceTags to pending',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Unpack'],
  })
  .input(resetUnpackStatusInput)
  .output(z.object({ resetCount: z.number() }))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const result = await db
      .update(PatchState)
      .set({ unpackStatus: 'pending', unpackError: null, unpackedAt: null })
      .where(inArray(PatchState.buildNumber, input.sourceTags))
      .returning({ buildNumber: PatchState.buildNumber });

    return { resetCount: result.length };
  });

export const unpackImportRouter = {
  listUnpackBuilds,
  resetUnpackStatus,
};
