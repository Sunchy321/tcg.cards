import { ORPCError, os } from '@orpc/server';

import _ from 'lodash';
import z from 'zod';

const random = os
    .route({
        method:      'GET',
        description: 'Get random card ID',
        tags:        ['PTCG', 'Card'],
    })
    .input(z.any())
    .output(z.string())
    .handler(async () => {
        throw new ORPCError('NOT_IMPLEMENTED');
    });

export const cardTrpc = {
    random,
};

export const cardApi = {
    random,
};
