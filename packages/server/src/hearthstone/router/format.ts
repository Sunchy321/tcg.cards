import { ORPCError, os } from '@orpc/server';

import z from 'zod';
import { eq } from 'drizzle-orm';

import { db } from '@/drizzle';
import { Format } from '../schema/format';
import { FormatChange } from '../schema/game-change';

import { format } from '@model/hearthstone/schema/format';
import { formatChange } from '@model/hearthstone/schema/game-change';

const full = os
    .route({
        method:      'GET',
        description: 'Get format by ID',
        tags:        ['Hearthstone', 'Format'],
    })
    .input(z.object({ formatId: z.string() }))
    .output(format)
    .handler(async ({ input }) => {
        const { formatId } = input;

        const format = await db.select()
            .from(Format)
            .where(eq(Format.formatId, formatId))
            .then(rows => rows[0]);

        if (format == null) {
            throw new ORPCError('NOT_FOUND');
        }

        return format;
    })
    .callable();

const changes = os
    .route({
        method:      'GET',
        description: 'Get format changes by ID',
        tags:        ['Hearthstone', 'Format'],
    })
    .input(z.object({ formatId: z.string() }))
    .output(formatChange.array())
    .handler(async ({ input }) => {
        const { formatId } = input;

        const formatChanges = await db.select()
            .from(FormatChange)
            .where(eq(FormatChange.format, formatId))
            .orderBy(FormatChange.effectiveDate);

        if (formatChanges == null) {
            throw new ORPCError('NOT_FOUND');
        }

        return formatChanges;
    })
    .callable();

export const formatTrpc = {
    full,
    changes,
};

export const formatApi = {
    '': full,
    changes,
};
