import { os } from '@orpc/server';

import z from 'zod';
import { scryfallBulk } from '@model/magic/schema/data/database';

import { BulkGetter } from '@/magic/data/scryfall/bulk';

const bulk = os
    .input(z.void())
    .output(scryfallBulk)
    .handler(async () => {
        return BulkGetter.data();
    });

export const scryfallTrpc = {
    bulk,
};
