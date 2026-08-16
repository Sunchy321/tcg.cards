import { os } from '@orpc/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { db } from '#db/db';
import { Format } from '#schema/shared/hearthstone';
import { format } from '#model/hearthstone/schema/format';

const get = os
  .route({
    method:      'GET',
    description: 'Get a format by id',
    tags:        ['Hearthstone', 'Format'],
  })
  .input(z.object({ formatId: z.string() }))
  .output(format.nullable())
  .handler(async ({ input }) => {
    const row = await db
      .select()
      .from(Format)
      .where(eq(Format.formatId, input.formatId))
      .then(rows => rows[0])
      .catch(error => {
        if (isMissingTable(error)) return undefined;
        throw error;
      });

    return row ?? null;
  });

export const formatTrpc = {
  get,
};

function isMissingTable(error: unknown): boolean {
  if (typeof error !== 'object' || error == null) return false;
  if ('code' in error && error.code === '42P01') return true;
  if ('message' in error && typeof error.message === 'string' && error.message.includes('hearthstone.formats')) return true;
  return 'cause' in error && isMissingTable(error.cause);
}
