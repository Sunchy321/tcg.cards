import { eventIterator, os } from '@orpc/server';
import z from 'zod';

import {
    getMtgchCard,
    countMissingLocalization as countMissing,
    type ImportProgress,
    ImportLocalizationTask,
} from '@/magic/data/mtgch/card';

import {
    type ImportAtomicProgress,
    ImportAtomicZhsTask,
} from '@/magic/data/mtgch/atomic-zhs';

const getCard = os
    .input(z.object({
        set:    z.string(),
        number: z.string(),
    }))
    .output(z.object({
        name:       z.string(),
        typeline:   z.string(),
        text:       z.string(),
        flavorText: z.string().optional(),
    }))
    .handler(async ({ input }) => {
        const { set, number } = input;

        const cardData = await getMtgchCard(set, number);

        if (cardData === null) {
            throw new Error(`Card not found: ${set}/${number}`);
        }

        return {
            name:       cardData.zhs_name ?? cardData.name,
            typeline:   cardData.zhs_type_line ?? cardData.type_line,
            text:       cardData.zhs_text ?? cardData.oracle_text ?? '',
            flavorText: cardData.zhs_flavor_text ?? cardData.flavor_text ?? undefined,
        };
    });

const countMissingLocalization = os
    .input(z.void())
    .output(z.object({
        cardLocalization:     z.number(),
        cardPartLocalization: z.number(),
    }))
    .handler(async () => {
        return await countMissing();
    });

const importLocalization = os
    .input(z.object({
        limit: z.number().int().positive().optional(),
    }))
    .output(eventIterator(z.custom<ImportProgress>()))
    .handler(async function* ({ input }) {
        const { limit } = input;

        const task = new ImportLocalizationTask(limit);

        yield* task.intoGenerator();
    });

const importAtomicZhs = os
    .input(z.object({
        limit: z.number().int().positive().optional(),
    }))
    .output(eventIterator(z.custom<ImportAtomicProgress>()))
    .handler(async function* ({ input }) {
        const { limit } = input;

        const task = new ImportAtomicZhsTask(limit);

        yield* task.intoGenerator();
    });

export const mtgchTrpc = {
    getCard,
    countMissingLocalization,
    importLocalization,
    importAtomicZhs,
};
