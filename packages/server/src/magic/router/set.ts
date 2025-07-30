import { t } from '@/trpc';
import { z } from 'zod';

import { eq, getTableColumns } from 'drizzle-orm';
import _ from 'lodash';

import { setProfile } from '@model/magic/set';

import { db } from '@/drizzle';
import { Set, SetLocalization } from '../schema/set';

export const setRouter = t.router({
    profile: t.procedure
        .input(z.object({ setId: z.string() }))
        .output(setProfile.optional())
        .query(async ({ input }) => {
            const { setId } = input;

            const [set] = await db.select().from(Set).where(eq(Set.setId, setId)).limit(1);

            if (set == null) {
                return undefined;
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
        }),
});
