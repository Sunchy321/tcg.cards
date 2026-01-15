import { os } from '@orpc/server';
import z from 'zod';

import { getMtgchCard } from '@/magic/data/mtgch/card';

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

        const card = await getMtgchCard(set, number);

        return {
            name:       card.zhs_name ?? card.name,
            typeline:   card.zhs_type_line ?? card.type_line,
            text:       card.zhs_text ?? card.oracle_text ?? '',
            flavorText: card.zhs_flavor_text ?? card.flavor_text ?? undefined,
        };
    });

export const mtgchTrpc = {
    getCard,
};
