import { oc } from '@orpc/contract';

import { gameInfo } from '../games';

export const info = oc
  .route({
    method:      'GET',
    description: 'Hearthstone game info',
    tags:        ['Hearthstone'],
  })
  .output(gameInfo);
