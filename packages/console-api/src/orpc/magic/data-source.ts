import { os } from '@orpc/server';
import { z } from 'zod';

import {
  importPolicySnapshot,
  magicImportPolicySnapshot,
} from '@tcg-cards/model/src/magic/schema/data/import';

const getSnapshot = os
  .route({
    method:      'GET',
    description: 'Get the current Magic import policy snapshot',
    tags:        ['Console', 'Magic', 'DataSource'],
  })
  .input(z.void())
  .output(importPolicySnapshot)
  .handler(async () => {
    return magicImportPolicySnapshot;
  });

export const dataSourceTrpc = {
  getSnapshot,
};
