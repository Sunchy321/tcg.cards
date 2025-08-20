import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator as zValidator } from 'hono-openapi/zod';

import { ORPCError, os } from '@orpc/server';

import { z } from 'zod';
import _ from 'lodash';
import { eq, getTableColumns } from 'drizzle-orm';

import { set, setProfile } from '@model/magic/schema/set';

import { db } from '@/drizzle';
import { Set, SetLocalization } from '../schema/set';

const list = os
    .input(z.void())
    .output(z.string().array())
    .handler(async () => {
        const sets = await db.select({ setId: Set.setId }).from(Set);

        return sets.map(s => s.setId);
    })
    .callable();

const full = os
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
            setId:           set.setId,
            parent:          set.parent,
            localization:    setLocalizations,
            type:            set.type,
            symbolStyle:     set.symbolStyle,
            doubleFacedIcon: set.doubleFacedIcon,
            releaseDate:     set.releaseDate,
        };
    });

export const setTrpc = {
    list,
    full,
    profile,
};

export const setApi = new Hono()
    .get(
        '/list',
        describeRoute({
            description: 'Get list of sets',
            tags:        ['Magic', 'Set'],
            responses:   {
                200: {
                    description: 'List of sets',
                    content:     {
                        'application/json': {
                            schema: resolver(z.string().array()),
                        },
                    },
                },
            },
            validateResponse: true,
        }),
        async c => c.json(await list()),
    )
    .get(
        '/full',
        describeRoute({
            description: 'Get full set infos',
            tags:        ['Magic', 'Set'],
            responses:   {
                200: {
                    description: 'Full set infos',
                    content:     {
                        'application/json': {
                            schema: resolver(set),
                        },
                    },
                },
            },
            validateResponse: true,
        }),
        zValidator('query', z.object({ setId: z.string() })),
        async c => c.json(await full(c.req.valid('query').setId)),
    );
