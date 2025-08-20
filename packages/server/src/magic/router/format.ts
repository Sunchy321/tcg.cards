import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator as zValidator } from 'hono-openapi/zod';

import { ORPCError, os } from '@orpc/server';

import z from 'zod';
import { eq } from 'drizzle-orm';

import { db } from '@/drizzle';
import { Format } from '../schema/format';
import { FormatChange } from '../schema/game-change';

import { format } from '@model/magic/schema/format';
import { formatChange } from '@model/magic/schema/game-change';

const full = os
    .input(z.string())
    .output(format)
    .handler(async ({ input }) => {
        const formatId = input;

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
    .input(z.string())
    .output(formatChange.array())
    .handler(async ({ input }) => {
        const formatId = input;

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

export const formatApi = new Hono()
    .get(
        '/',
        describeRoute({
            tags:      ['Magic', 'Format'],
            summary:   'Get format by ID',
            responses: {
                200: {
                    description: 'Format details',
                    content:     {
                        'application/json': {
                            schema: resolver(format),
                        },
                    },
                },
            },
            validateResponse: true,
        }),
        zValidator('query', z.object({ formatId: z.string() })),
        async c => c.json(await full(c.req.valid('query').formatId)),
    )
    .get(
        '/changes',
        describeRoute({
            tags:      ['Magic', 'Format'],
            summary:   'Get format changes by ID',
            responses: {
                200: {
                    description: 'Format details',
                    content:     {
                        'application/json': {
                            schema: resolver(formatChange.array()),
                        },
                    },
                },
            },
            validateResponse: true,
        }),
        zValidator('query', z.object({ formatId: z.string() })),
        async c => c.json(await changes(c.req.valid('query').formatId)),
    );
