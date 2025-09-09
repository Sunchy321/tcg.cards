import { os } from '@orpc/server';

import z from 'zod';

import { database } from '@model/magic/schema/data/database';

import { db } from '@/drizzle';
import { Card, CardLocalization, CardPart, CardPartLocalization } from '@/magic/schema/card';
import { Print, PrintPart } from '@/magic/schema/print';
import { Set } from '@/magic/schema/set';

const count = os
    .input(z.void())
    .output(database)
    .handler(async () => {
        const card = await db.$count(Card);
        const cardLocalization = await db.$count(CardLocalization);
        const cardPart = await db.$count(CardPart);
        const cardPartLocalization = await db.$count(CardPartLocalization);

        const print = await db.$count(Print);
        const printPart = await db.$count(PrintPart);

        const set = await db.$count(Set);

        return {
            card,
            cardLocalization,
            cardPart,
            cardPartLocalization,

            print,
            printPart,

            set,
        };
    });

export const databaseTrpc = {
    count,
};
