import { ORPCError, os as create } from '@orpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@tcg-cards/db/db';
import { UserConfig } from '@tcg-cards/db/schema/remote';

const os = create.$context<{ user: { id: string } | null }>();

const getInput = z.strictObject({ gameId: z.string() });
const putInput = z.strictObject({
  gameId: z.string(),
  config: z.record(z.string(), z.unknown()),
});

const get = os
  .route({
    method:      'GET',
    description: 'Get user config for a game',
    tags:        ['User Config'],
  })
  .input(getInput)
  .handler(async ({ input, context }) => {
    const { user } = context;
    if (user == null) {
      throw new ORPCError('UNAUTHORIZED', { message: 'Login required' });
    }

    const row = await db.select()
      .from(UserConfig)
      .where(and(
        eq(UserConfig.userId, user.id),
        eq(UserConfig.gameId, input.gameId),
      ))
      .then(rows => rows[0] ?? null);

    return row?.config ?? null;
  });

const put = os
  .route({
    method:      'PUT',
    description: 'Save user config for a game',
    tags:        ['User Config'],
  })
  .input(putInput)
  .handler(async ({ input, context }) => {
    const { user } = context;
    if (user == null) {
      throw new ORPCError('UNAUTHORIZED', { message: 'Login required' });
    }

    await db.insert(UserConfig)
      .values({
        userId: user.id,
        gameId: input.gameId,
        config: input.config,
      })
      .onConflictDoUpdate({
        target:  [UserConfig.userId, UserConfig.gameId],
        set:     { config: input.config },
      });

    return { ok: true };
  });

export const userConfigTrpc = {
  get,
  put,
};
