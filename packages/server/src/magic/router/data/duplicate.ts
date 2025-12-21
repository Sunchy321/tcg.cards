import { os } from '@orpc/server';

import { duplicate, duplicateMode } from '@model/magic/schema/data/duplicate';

import { db } from '@/drizzle';
import { Print, PrintPart } from '@/magic/schema/print';

import { and, eq, sql } from 'drizzle-orm';

const get = os
    .input(duplicateMode)
    .output(duplicate.optional())
    .handler(async ({ input }) => {
        const mode = input;

        switch (mode) {
        case 'print': {
            const primaryKeys = await db
                .select({
                    count:  sql<number>`COUNT(*)`.as('count'),
                    set:    Print.set,
                    number: Print.number,
                    lang:   Print.lang,
                })
                .from(Print)
                .groupBy(Print.set, Print.number, Print.lang)
                .having(sql`COUNT(*) > 1`);

            const primaryKey = primaryKeys[0];

            if (primaryKeys == null) {
                return undefined;
            }

            const duplicate = await db
                .select()
                .from(Print)
                .where(
                    and(
                        eq(Print.set, primaryKey.set),
                        eq(Print.number, primaryKey.number),
                        eq(Print.lang, primaryKey.lang),
                    ),
                );

            return {
                total: primaryKeys.length,

                set:    primaryKey.set,
                number: primaryKey.number,
                lang:   primaryKey.lang,

                duplicates:    duplicate.map(d => d.cardId),
                duplicateData: duplicate,
            };
        }
        case 'printPart': {
            const primaryKeys = await db
                .select({
                    count:     sql<number>`COUNT(*)`.as('count'),
                    set:       PrintPart.set,
                    number:    PrintPart.number,
                    lang:      PrintPart.lang,
                    partIndex: PrintPart.partIndex,
                })
                .from(PrintPart)
                .groupBy(PrintPart.set, PrintPart.number, PrintPart.lang, PrintPart.partIndex)
                .having(sql`COUNT(*) > 1`);

            const primaryKey = primaryKeys[0];

            if (primaryKey == null) {
                return undefined;
            }

            const duplicate = await db
                .select()
                .from(PrintPart)
                .where(
                    and(
                        eq(PrintPart.set, primaryKey.set),
                        eq(PrintPart.number, primaryKey.number),
                        eq(PrintPart.lang, primaryKey.lang),
                        eq(PrintPart.partIndex, primaryKey.partIndex),
                    ),
                );

            return {
                total: primaryKeys.length,

                set:       primaryKey.set,
                number:    primaryKey.number,
                lang:      primaryKey.lang,
                partIndex: primaryKey.partIndex,

                duplicates:    duplicate.map(d => d.cardId),
                duplicateData: duplicate,
            };
        }
        default:
            throw new Error(`Unsupported duplicate mode: ${mode}`);
        }
    });

export const duplicateTrpc = {
    get,
};
