import { ORPCError, os } from '@orpc/server';

import { z } from 'zod';
import _ from 'lodash';
import { eq, getTableColumns } from 'drizzle-orm';

import { set, setProfile } from '@model/lorcana/schema/set';

import { db } from '@/drizzle';
import { Set, SetLocalization } from '../schema/set';
import { Print } from '../schema/print';
import { Rarity } from '@model/lorcana/schema/basic';

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

const save = os
    .input(set)
    .output(z.object({ setId: z.string() }))
    .handler(async ({ input }) => {
        const {
            setId,
            number,
            cardCount,
            langs,
            rarities,
            type,
            releaseDate,
            prereleaseDate,
            lorcanaJsonId,
            localization = [],
        } = input;

        await db.transaction(async tx => {
            const existing = await tx.select().from(Set).where(eq(Set.setId, setId)).then(r => r[0]);

            if (existing) {
                await tx.update(Set).set({
                    number,
                    cardCount,
                    langs,
                    rarities,
                    type,
                    releaseDate,
                    prereleaseDate,
                    lorcanaJsonId,
                }).where(eq(Set.setId, setId));

                await tx.delete(SetLocalization).where(eq(SetLocalization.setId, setId));
            } else {
                await tx.insert(Set).values({
                    setId,
                    number,
                    cardCount,
                    langs,
                    rarities,
                    type,
                    releaseDate,
                    prereleaseDate,
                    lorcanaJsonId,
                });
            }

            if (localization.length > 0) {
                await tx.insert(SetLocalization).values(
                    localization.filter(l => l.name !== '').map(l => ({ setId, lang: l.lang, name: l.name })),
                );
            }
        });

        return { setId };
    })
    .callable();

const calcField = os
    .input(z.void())
    .output(z.object({ updated: z.number() }))
    .handler(async () => {
        const prints = await db.select({
            set:    Print.set,
            number: Print.number,
            lang:   Print.lang,
            rarity: Print.rarity,
        }).from(Print);

        const sets = await db.select()
            .from(Set);

        let updated = 0;

        for (const s of sets) {
            const related = prints.filter(p => p.set === s.setId);

            if (related.length === 0) {
                continue;
            }

            const cardNumbers = _.uniq(related.map(r => r.number));
            const langs = _.uniq(related.map(r => r.lang)).sort();
            const rarities = _.uniq(related.map(r => r.rarity)).sort();

            await db.update(Set).set({
                cardCount: cardNumbers.length,
                langs,
                rarities:  rarities as Rarity[],
            }).where(eq(Set.setId, s.setId));

            updated += 1;
        }

        return { updated };
    })
    .callable();

export const setTrpc = {
    list,
    full,
    profile,
    save,
    calcField,
};

export const setApi = {
    list,
    '': full,
    complete,
};
