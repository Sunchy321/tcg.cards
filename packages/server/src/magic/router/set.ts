import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator as zValidator } from 'hono-openapi/zod';

import { z } from 'zod';

import { eq, getTableColumns } from 'drizzle-orm';
import _ from 'lodash';

import { SetProfile, setProfile } from '@model/magic/schema/set';

import { db } from '@/drizzle';
import { Set, SetLocalization } from '../schema/set';

export const setRouter = new Hono()
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
                            schema: resolver(z.array(setProfile)),
                        },
                    },
                },
            },
        }),
        async c => {
            c.header('Cache-Control', 'public, max-age=3600');

            const sets = await db.select({ setId: Set.setId }).from(Set);

            return c.json(sets.map(s => s.setId));
        },
    )
    .get(
        '/profile',
        describeRoute({
            description: 'Get set profile by set ID',
            tags:        ['Magic', 'Set'],
            responses:   {
                200: {
                    description: 'Set profile',
                    content:     {
                        'application/json': {
                            schema: resolver(setProfile.optional()),
                        },
                    },
                },
            },
        }),
        zValidator('query', z.object({ setId: z.string() })),
        async c => {
            c.header('Cache-Control', 'public, max-age=3600');

            const { setId } = c.req.valid('query');

            return c.json(await getProfile(setId));
        });

async function getProfile(setId: string): Promise<SetProfile | null> {
    const [set] = await db.select().from(Set).where(eq(Set.setId, setId)).limit(1);

    if (set == null) {
        return null;
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
}
