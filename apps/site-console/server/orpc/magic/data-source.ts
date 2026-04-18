import { os } from '@orpc/server';
import { z } from 'zod';

import {
  importPolicySnapshot,
  magicImportPolicySnapshot,
} from '#model/magic/schema/data/import';

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
  })
  .callable();

export const dataSourceTrpc = {
  getSnapshot,
};
