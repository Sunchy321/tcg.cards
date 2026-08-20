import { os } from '../../orpc';

import { birthday, id, locale } from '@tcg-cards/model/hearthstone/schema/basic';

export const info = os.hearthstone['']
  .handler(async () => ({
    gameId:  id,
    name:    'Hearthstone',
    birthday,
    locales: [...locale.options],
  }));
