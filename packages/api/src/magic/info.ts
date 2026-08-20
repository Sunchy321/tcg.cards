import { oc } from '@orpc/contract';

import { gameInfo } from '../games';

export const info = oc
  .route({
    method:      'GET',
    description: 'Magic: The Gathering game info',
    tags:        ['Magic'],
  })
  .output(gameInfo);
