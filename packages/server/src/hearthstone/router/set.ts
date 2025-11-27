import { ORPCError, os } from '@orpc/server';

import { z } from 'zod';
import _ from 'lodash';
import { eq, getTableColumns } from 'drizzle-orm';

import { set, setProfile } from '@model/hearthstone/schema/set';

import { db } from '@/drizzle';
import { Set, SetLocalization } from '../schema/set';

const list = os
    .route({
        method:      'GET',
        description: 'Get list of sets',
        tags:        ['Hearthstone', 'Set'],
    })
    .input(z.any())
    .output(z.string().array())
    .handler(async () => {
        const sets = await db.select({ setId: Set.setId })
            .from(Set)
            .orderBy(Set.releaseDate)
            .then(rows => rows.map(s => s.setId));

        return sets;
    });

const full = os
    .route({
        method:      'GET',
        description: 'Get full set infos',
        tags:        ['Hearthstone', 'Set'],
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
        tags:        ['Hearthstone', 'Set'],
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

const save = os
    .input(set)
    .output(z.object({ setId: z.string() }))
    .handler(async ({ input }) => {
        const { setId, dbfId, type, releaseDate, cardCountFull, cardCount, localization } = input;

        await db.transaction(async tx => {
            const existing = await tx.select().from(Set).where(eq(Set.setId, setId)).then(r => r[0]);

            if (existing) {
                await tx.update(Set).set({
                    dbfId,
                    type,
                    releaseDate,
                    cardCountFull: cardCountFull ?? existing.cardCountFull ?? null,
                    cardCount:     cardCount ?? existing.cardCount ?? null,
                    slug:          existing.slug ?? setId,
                    group:         existing.group ?? null,
                }).where(eq(Set.setId, setId));

                // 覆盖本地化
                await tx.delete(SetLocalization).where(eq(SetLocalization.setId, setId));
            } else {
                await tx.insert(Set).values({
                    setId,
                    dbfId,
                    type,
                    releaseDate,
                    cardCountFull: cardCountFull ?? null,
                    cardCount:     cardCount ?? null,
                    slug:          setId,
                });
            }

            if (localization.length > 0) {
                await tx.insert(SetLocalization).values(
                    localization.map(l => ({ setId, lang: l.lang, name: l.name })),
                );
            }
        });

        return { setId };
    })
    .callable();

export const setTrpc = {
    list,
    full,
    profile,
    save,
};

export const setApi = {
    list,
    '': full,
    complete,
};
