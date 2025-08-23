import { ORPCError, os } from '@orpc/server';

import { z } from 'zod';
import _, { omit } from 'lodash';
import { eq, getTableColumns, inArray } from 'drizzle-orm';

import { set, setProfile } from '@model/magic/schema/set';

import { db } from '@/drizzle';
import { Booster, Pack, PackContent, Set, SetLocalization, Sheet, SheetCard } from '../schema/set';

const list = os
    .route({
        method:      'GET',
        description: 'Get list of sets',
        tags:        ['Magic', 'Set'],
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
        tags:        ['Magic', 'Set'],
    })
    .input(z.object({ setId: z.string() }))
    .output(set.omit({ boosters: true }))
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
        tags:        ['Magic', 'Set'],
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

        const allBoosters = await db.select()
            .from(Booster)
            .where(eq(Booster.setId, setId));

        const boosterIds = allBoosters.map(b => b.id);

        const allPacks = await db.select()
            .from(Pack)
            .where(inArray(Pack.boosterId, boosterIds));

        const allSheets = await db.select()
            .from(Sheet)
            .where(inArray(Sheet.boosterId, boosterIds));

        const allPackContents = await db.select()
            .from(PackContent)
            .where(inArray(PackContent.packId, allPacks.map(p => p.id)));

        const allSheetCards = await db.select()
            .from(SheetCard)
            .where(inArray(SheetCard.sheetId, allSheets.map(s => s.id)));

        const boosters = allBoosters.map(b => {
            const packs = allPacks.filter(p => p.boosterId === b.id).map(p => ({
                ..._.omit(p, ['id', 'boosterId']),
                contents: allPackContents.filter(c => c.packId === p.id).map(c => _.omit(c, ['id', 'packId'])),
            }));

            const sheets = allSheets.filter(s => s.boosterId === b.id).map(s => ({
                ..._.omit(s, ['id', 'boosterId']),
                cards: allSheetCards.filter(c => c.sheetId === s.id).map(c => _.omit(c, ['id', 'sheetId'])),
            }));

            return {
                ...omit(b, ['id', 'setId']),
                packs,
                sheets,
            };
        });

        return {
            ...set,
            localization: setLocalizations,
            boosters,
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

export const setApi = {
    list,
    '': full,
    complete,
};
