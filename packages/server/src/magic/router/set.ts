import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator as zValidator } from 'hono-openapi/zod';

import { z } from 'zod';

import { eq, getTableColumns } from 'drizzle-orm';
import _ from 'lodash';

import { setProfile } from '@model/magic/set';

import { db } from '@/drizzle';
import { Set, SetLocalization } from '../schema/set';

const router = new Hono()
    .basePath('/set')
    .get(
        '/profile',
        describeRoute({
            description: 'Get set profile by set ID',
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
            const { setId } = c.req.valid('query');

            const [set] = await db.select().from(Set).where(eq(Set.setId, setId)).limit(1);

            if (set == null) {
                return c.json(null);
            }

            const setLocalizations = await db.select({
                ..._.omit(getTableColumns(SetLocalization), 'setId'),
            }).from(SetLocalization).where(eq(SetLocalization.setId, setId));

            return c.json({
                setId:           set.setId,
                parent:          set.parent,
                localization:    setLocalizations,
                type:            set.type,
                symbolStyle:     set.symbolStyle,
                doubleFacedIcon: set.doubleFacedIcon,
                releaseDate:     set.releaseDate,
            });
        });

export default router;
