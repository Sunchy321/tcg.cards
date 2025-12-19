import { ORPCError, os } from '@orpc/server';

import { z } from 'zod';
import _, { omit } from 'lodash';
import { eq, getTableColumns, inArray } from 'drizzle-orm';

import axios from 'axios';
import * as cheerio from 'cheerio';

import { set, setProfile } from '@model/magic/schema/set';

import { db } from '@/drizzle';
import { Booster, Pack, PackContent, Set, SetLocalization, Sheet, SheetCard } from '../schema/set';
import { Print } from '../schema/print';

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

const calcField = os
    .input(z.void())
    .output(z.object({ updated: z.number() }))
    .handler(async () => {
        const allPrints = await db.select({
            set:    Print.set,
            number: Print.number,
            lang:   Print.lang,
            rarity: Print.rarity,
        }).from(Print);

        const sets = await db.select()
            .from(Set);

        let updated = 0;

        for (const s of sets) {
            const cards = allPrints.filter(p => p.set === s.setId);
            if (cards.length === 0) continue;

            const cardCount = _.uniq(cards.map(c => c.number)).length;
            const langs = _.uniq(cards.map(c => c.lang)).sort();
            const rarities = _.uniq(cards.map(c => c.rarity)).sort();

            await db.update(Set).set({ cardCount, langs, rarities }).where(eq(Set.setId, s.setId));
            updated += 1;
        }

        return { updated };
    });

const fillLink = os
    .input(z.object({ link: z.string() }))
    .output(z.record(z.string(), z.object({ link: z.string(), name: z.string() })))
    .handler(async ({ input }) => {
        const { link } = input;

        if (link == '') {
            return {};
        }

        const linkMap: Record<string, string> = {
            en:  'en',
            de:  'de',
            es:  'es',
            fr:  'fr',
            it:  'it',
            ja:  'ja',
            ko:  'ko',
            pt:  'pt-br',
            ru:  'ru',
            zhs: 'zh-hans',
            zht: 'zh-hant',
        };

        const result: Record<string, { link: string, name: string }> = {};
        const locales = ['en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'ru', 'zhs', 'zht'];

        for (const l of locales) {
            const localeUrl = link.replace('/en/', `/${linkMap[l]}/`);

            try {
                const html = await axios.get(localeUrl);
                const $ = cheerio.load(html.data);

                result[l] = {
                    link: localeUrl,
                    name: $('title').text().replace(/\|.*$/, ''),
                };
            } catch {
                result[l] = { link: localeUrl, name: '' };
            }
        }

        return result;
    });

const save = os
    .input(set.omit({ boosters: true }))
    .output(z.object({ setId: z.string() }))
    .handler(async ({ input }) => {
        const {
            setId,
            block,
            parent,
            printedSize,
            cardCount,
            langs,
            rarities,
            type,
            isDigital,
            isFoilOnly,
            isNonfoilOnly,
            symbolStyle,
            doubleFacedIcon,
            releaseDate,
            scryfallId,
            scryfallCode,
            mtgoCode,
            tcgPlayerId,
            localization = [],
        } = input as any;

        await db.transaction(async tx => {
            const existing = await tx.select().from(Set).where(eq(Set.setId, setId)).then(r => r[0]);

            if (existing) {
                await tx.update(Set).set({
                    block,
                    parent,
                    printedSize,
                    cardCount,
                    langs,
                    rarities,
                    type,
                    isDigital,
                    isFoilOnly,
                    isNonfoilOnly,
                    symbolStyle,
                    doubleFacedIcon,
                    releaseDate,
                    scryfallId,
                    scryfallCode,
                    mtgoCode,
                    tcgPlayerId,
                }).where(eq(Set.setId, setId));

                await tx.delete(SetLocalization).where(eq(SetLocalization.setId, setId));
            } else {
                await tx.insert(Set).values({
                    setId,
                    block,
                    parent,
                    printedSize,
                    cardCount,
                    langs,
                    rarities,
                    type,
                    isDigital,
                    isFoilOnly,
                    isNonfoilOnly,
                    symbolStyle,
                    doubleFacedIcon,
                    releaseDate,
                    scryfallId,
                    scryfallCode,
                    mtgoCode,
                    tcgPlayerId,
                });
            }

            if (localization && localization.length > 0) {
                const locs = localization as any[];

                await tx.insert(SetLocalization).values(
                    locs
                        .filter(loc => (loc.name ?? '') !== '' || (loc.link ?? '') !== '')
                        .map(loc => ({ setId, lang: String(loc.lang), name: (loc.name ?? null) as string | null, link: (loc.link ?? null) as string | null })),
                );
            }
        });

        return { setId };
    });

export const setTrpc = {
    list,
    full,
    complete,
    profile,
    calcField,
    fillLink,
    save,
};

export const setApi = {
    list,
    '': full,
    complete,
};
