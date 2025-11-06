import { ORPCError, os } from '@orpc/server';

import z from 'zod';

import { eq } from 'drizzle-orm';
import { db } from '@/drizzle';

import { Game } from '@model/schema';
import { Column, Table } from './database';

type FormatTable<G extends Game> = Table<G, 'formats', {
    formatId: Column<true>;
}>;

type FormatChangeTable<G extends Game> = Table<G, 'format_changes', {
    format:        Column<false>;
    effectiveDate: Column<false>;
}>;

export type FormatOptions<G extends Game, F extends z.ZodTypeAny, FC extends z.ZodTypeAny> = {
    table:           {
        Format:       FormatTable<G>;
        FormatChange: FormatChangeTable<G>;
    };
    schema:           {
        format:       F;
        formatChange: FC;
    };
    formatStaticList: string[];
};

export function useFormat<
    G extends Game,
    F extends z.ZodTypeAny,
    FC extends z.ZodTypeAny,
>(game: G, options: FormatOptions<G, F, FC>) {
    const {
        table: { Format, FormatChange },
        schema: { format, formatChange },
        formatStaticList,
    } = options;

    const list = os
        .route({
            method:      'GET',
            description: 'List all formats',
            tags:        [game, 'Format'],
        })
        .input(z.any())
        .output(z.string().array())
        .handler(async () => {
            const formats = await db.select({ formatId: Format.formatId })
                .from(Format)
                .then(formats => formats.map(f => f.formatId));

            return formats.sort((a, b) => formatStaticList.indexOf(a) - formatStaticList.indexOf(b));
        });

    const full = os
        .route({
            method:      'GET',
            description: 'Get format by ID',
            tags:        [game, 'Format'],
        })
        .input(z.object({ formatId: z.string() }))
        .output(format)
        .handler(async ({ input }) => {
            const { formatId } = input;

            const format = await db.select()
                .from(Format)
                .where(eq(Format.formatId, formatId))
                .then(rows => rows[0]);

            if (format == null) {
                throw new ORPCError('NOT_FOUND');
            }

            return format as any;
        })
        .callable();

    const changes = os
        .route({
            method:      'GET',
            description: 'Get format changes by ID',
            tags:        [game, 'Format'],
        })
        .input(z.object({ formatId: z.string() }))
        .output(formatChange.array())
        .handler(async ({ input }) => {
            const { formatId } = input;

            const formatChanges = await db.select()
                .from(FormatChange)
                .where(eq(FormatChange.format, formatId))
                .orderBy(FormatChange.effectiveDate);

            if (formatChanges == null) {
                throw new ORPCError('NOT_FOUND');
            }

            return formatChanges as any;
        })
        .callable();

    return { list, full, changes };
}
