import { os } from '@orpc/server';

import { gameInfo } from '../games';
import { birthday, id, locale } from '@tcg-cards/model/src/hearthstone/schema/basic';

export const info = os
  .route({
    method:      'GET',
    description: 'Hearthstone game info',
    tags:        ['Hearthstone'],
  })
  .output(gameInfo)
  .handler(async () => ({
    gameId:  id,
    name:    'Hearthstone',
    birthday,
    locales: [...locale.options],
  }));
