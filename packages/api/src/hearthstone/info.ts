import { oc } from '@orpc/contract';

import { gameInfo } from '../games';

export const info = oc
  .route({
    method: 'GET',
    tags:   ['Hearthstone'],
  })
  .output(gameInfo);
