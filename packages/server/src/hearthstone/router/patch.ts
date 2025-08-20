import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator as zValidator } from 'hono-openapi/zod';

import { ORPCError, os } from '@orpc/server';

import z from 'zod';

import { eq } from 'drizzle-orm';

import { Patch } from '../schema/patch';

import { db } from '@/drizzle';
import { patchSchema } from '@model/hearthstone/schema/patch';

const list = os
    .input(z.void())
    .output(patchSchema.array())
    .handler(async () => {
        const patches = await db.select().from(Patch).orderBy(Patch.buildNumber);

        return patches;
    });

const full = os
    .input(z.number())
    .output(patchSchema)
    .handler(async ({ input }) => {
        const buildNumber = input;

        const patch = await db
            .select()
            .from(Patch)
            .where(eq(Patch.buildNumber, buildNumber))
            .limit(1)
            .then(rows => rows[0]);

        if (patch == null) {
            throw new ORPCError('NOT_FOUND');
        }

        return patch;
    });

export const patchTrpc = {
    list,
    full,
};
