import { ORPCError, os } from '@orpc/server';

import z from 'zod';

import { and, eq } from 'drizzle-orm';

import { db } from '@/drizzle';
import { PrintView } from '../schema/print';

import { locale } from '@model/magic/schema/basic';
import { printView } from '@model/magic/schema/print';

const basic = os
    .route({
        method:      'GET',
        description: 'Get print by ID',
        tags:        ['Magic', 'Print'],
    })
    .input(z.object({
        cardId:    z.string().describe('Print ID'),
        set:       z.string().describe('Set ID'),
        number:    z.string().describe('Card number in the set'),
        lang:      locale.default('en').describe('Language of the print'),
        partIndex: z.int().min(0).describe('Part index of the print, if it has multiple parts (e.g. split cards)'),
    }))
    .output(printView)
    .handler(async ({ input }) => {
        const { cardId, set, number, lang, partIndex } = input;

        const view = await db.select()
            .from(PrintView)
            .where(and(
                eq(PrintView.cardId, cardId),
                eq(PrintView.set, set),
                eq(PrintView.number, number),
                eq(PrintView.lang, lang),
                eq(PrintView.partIndex, partIndex),
            ))
            .then(rows => rows[0]);

        if (view == null) {
            throw new ORPCError('NOT_FOUND');
        }

        return view;
    });

export const printTrpc = {

};

export const printApi = {
    '': basic,
};
