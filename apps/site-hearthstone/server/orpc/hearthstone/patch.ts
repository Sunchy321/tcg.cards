import { os } from '@orpc/server';

import z from 'zod';
import { desc, eq } from 'drizzle-orm';

import { patch } from '#model/hearthstone/schema/patch';

import { db } from '#db/db';
import { Patch } from '#schema/hearthstone/patch';

const list = os
  .route({
    method:      'GET',
    description: 'List all patches',
    tags:        ['Hearthstone', 'Patch'],
  })
  .input(z.any())
  .output(patch.array())
  .handler(async () => {
    const patches = await db
      .select()
      .from(Patch)
      .orderBy(desc(Patch.buildNumber))
      .catch(error => {
        if (isMissingPatchTable(error)) return [];
        throw error;
      });

    return patches;
  });

const full = os
  .route({
    method:      'GET',
    description: 'Get patch by build number',
    tags:        ['Hearthstone', 'Patch'],
  })
  .input(z.object({ buildNumber: z.number() }))
  .output(patch)
  .handler(async ({ input }) => {
    const { buildNumber } = input;

    const found = await db
      .select()
      .from(Patch)
      .where(eq(Patch.buildNumber, buildNumber))
      .limit(1)
      .then(rows => rows[0])
      .catch(error => {
        if (isMissingPatchTable(error)) return null;
        throw error;
      });

    return found ?? fallbackPatch(buildNumber);
  });

const save = os
  .input(patch)
  .output(z.void())
  .handler(async ({ input }) => {
    const existing = await db
      .select()
      .from(Patch)
      .where(eq(Patch.buildNumber, input.buildNumber))
      .limit(1)
      .then(rows => rows[0]);

    if (existing) {
      await db
        .update(Patch)
        .set({
          buildNumber: input.buildNumber,
          name:        input.name,
          shortName:   input.shortName,
          hash:        input.hash,
        })
        .where(eq(Patch.buildNumber, input.buildNumber));
    } else {
      await db
        .insert(Patch)
        .values({
          buildNumber: input.buildNumber,
          name:        input.name,
          shortName:   input.shortName,
          hash:        input.hash,
        });
    }
  });

export const patchTrpc = {
  list,
  full,
  save,
};

export const patchApi = {
  list,
  '': full,
};

function fallbackPatch(buildNumber: number) {
  return {
    buildNumber,
    name:      `${buildNumber}`,
    shortName: `${buildNumber}`,
    hash:      '',
    isLatest:  false,
    isUpdated: false,
  };
}

function isMissingPatchTable(error: unknown): boolean {
  if (typeof error !== 'object' || error == null) return false;

  if ('code' in error && error.code === '42P01') return true;
  if (
    'message' in error
    && typeof error.message === 'string'
    && error.message.includes('hearthstone.patches')
  ) {
    return true;
  }

  return 'cause' in error && isMissingPatchTable(error.cause);
}
