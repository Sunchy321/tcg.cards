import { os } from '@orpc/server';

import z from 'zod';

/** The games mounted in the API registry (subset of @tcg-cards/base GAMES). */
export const API_GAMES = ['magic', 'hearthstone'] as const;

export type ApiGame = (typeof API_GAMES)[number];

export const gameInfo = z.looseObject({
  gameId:   z.string(),
  name:     z.string(),
  birthday: z.string(),
  locales:  z.string().array(),
});

export type GameInfo = z.infer<typeof gameInfo>;

export const games = os
  .route({
    method:      'GET',
    description: 'List supported games',
    tags:        ['Meta'],
  })
  .output(z.string().array())
  .handler(async () => [...API_GAMES]);
