import { os } from '../../orpc';

import { birthday, id, locale, mainLocale } from '@tcg-cards/model/magic/schema/basic';

export const info = os.magic['']
  .handler(async () => ({
    gameId:      id,
    name:        'Magic: The Gathering',
    birthday,
    mainLocales: [...mainLocale.options],
    locales:     [...locale.options],
  }));
