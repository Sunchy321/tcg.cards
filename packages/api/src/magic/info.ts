import { os } from '@orpc/server';

import { gameInfo } from '../games';
import { birthday, id, locale, mainLocale } from '@tcg-cards/model/src/magic/schema/basic';

export const info = os
  .route({
    method:      'GET',
    description: 'Magic: The Gathering game info',
    tags:        ['Magic'],
  })
  .output(gameInfo)
  .handler(async () => ({
    gameId:      id,
    name:        'Magic: The Gathering',
    birthday,
    mainLocales: [...mainLocale.options],
    locales:     [...locale.options],
  }));
