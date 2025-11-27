import { ORPCError, os } from '@orpc/server';

import z from 'zod';
import { desc, eq } from 'drizzle-orm';

import { patch } from '@model/hearthstone/schema/patch';

import { db } from '@/drizzle';
import { Patch } from '../schema/patch';

const list = os
    .input(z.void())
    .output(patch.array())
    .handler(async () => {
        const patches = await db.select().from(Patch).orderBy(desc(Patch.buildNumber));

        return patches;
    });

const full = os
    .input(z.number())
    .output(patch)
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

const save = os
    .input(patch)
    .output(z.void())
    .handler(async ({ input }) => {
        const existing = await db
            .select()
            .from(Patch)
            .where(eq(Patch.buildNumber, input.buildNumber))
            .limit(1)
            .then(rows => rows[0]);

        if (existing) {
            await db
                .update(Patch)
                .set({
                    buildNumber: input.buildNumber,
                    name:        input.name,
                    shortName:   input.shortName,
                    hash:        input.hash,
                })
                .where(eq(Patch.buildNumber, input.buildNumber));
        } else {
            await db
                .insert(Patch)
                .values({
                    buildNumber: input.buildNumber,
                    name:        input.name,
                    shortName:   input.shortName,
                    hash:        input.hash,
                });
        }
    });

export const patchTrpc = {
    list,
    full,
    save,
};

export const patchApi = {
    list,
    '': full,
};
