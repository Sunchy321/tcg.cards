import { ORPCError, os } from '@orpc/server';

import { z } from 'zod';
import _ from 'lodash';
import { eq, getTableColumns } from 'drizzle-orm';

import { set, setProfile } from '@model/lorcana/schema/set';

import { db } from '@/drizzle';
import { Set, SetLocalization } from '../schema/set';

const list = os
    .route({
        method:      'GET',
        description: 'Get list of sets',
        tags:        ['Lorcana', 'Set'],
    })
    .input(z.any())
    .output(z.string().array())
    .handler(async () => {
        const sets = await db.select({ setId: Set.setId })
            .from(Set)
            .orderBy(Set.releaseDate);

        return sets.map(s => s.setId);
    });

const full = os
    .route({
        method:      'GET',
        description: 'Get full set infos',
        tags:        ['Lorcana', 'Set'],
    })
    .input(z.object({ setId: z.string() }))
    .output(set)
    .handler(async ({ input }) => {
        const { setId } = input;

        const set = await db.select()
            .from(Set)
            .where(eq(Set.setId, setId))
            .then(rows => rows[0]);

        if (set == null) {
            throw new ORPCError('NOT_FOUND');
        }

        const setLocalizations = await db.select({
            ..._.omit(getTableColumns(SetLocalization), 'setId'),
        }).from(SetLocalization).where(eq(SetLocalization.setId, setId));

        return {
            ...set,
            localization: setLocalizations,
        };
    })
    .callable();

const complete = os
    .route({
        method:      'GET',
        description: 'Get complete set infos',
        tags:        ['Lorcana', 'Set'],
    })
    .input(z.object({ setId: z.string() }))
    .output(set)
    .handler(async ({ input }) => {
        const { setId } = input;

        const set = await db.select()
            .from(Set)
            .where(eq(Set.setId, setId))
            .then(rows => rows[0]);

        if (set == null) {
            throw new ORPCError('NOT_FOUND');
        }

        const setLocalizations = await db.select({
            ..._.omit(getTableColumns(SetLocalization), 'setId'),
        }).from(SetLocalization).where(eq(SetLocalization.setId, setId));

        return {
            ...set,
            localization: setLocalizations,
        };
    })
    .callable();

const profile = os
    .input(z.string())
    .output(setProfile)
    .handler(async ({ input }) => {
        const setId = input;

        const set = await db.select()
            .from(Set)
            .where(eq(Set.setId, setId))
            .then(rows => rows[0]);

        if (set == null) {
            throw new ORPCError('NOT_FOUND');
        }

        const setLocalizations = await db.select({
            ..._.omit(getTableColumns(SetLocalization), 'setId'),
        }).from(SetLocalization).where(eq(SetLocalization.setId, setId));

        return {
            setId:        set.setId,
            localization: setLocalizations,
            type:         set.type,
            releaseDate:  set.releaseDate,
        };
    });

export const setTrpc = {
    list,
    full,
    profile,
};

export const setApi = {
    list,
    '': full,
    complete,
};
