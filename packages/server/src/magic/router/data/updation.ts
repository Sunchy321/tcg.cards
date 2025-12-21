import { os } from '@orpc/server';

import z from 'zod';
import { Updation, updation, UpdationMode, updationResponse, updationMode } from '@model/magic/schema/data/updation';

import { db } from '@/drizzle';
import { Card, CardLocalization, CardPart, CardPartLocalization } from '@/magic/schema/card';
import { Print, PrintPart } from '@/magic/schema/print';

import { and, eq, getTableColumns, sql } from 'drizzle-orm';
import { isEqual, pick } from 'lodash';

import { updation as log } from '@/magic/logger';

type TablePrimaryKeys = Omit<Updation, 'key' | 'oldValue' | 'newValue'>;
type TablePrimaryKeysIndex = keyof TablePrimaryKeys;

function check(primaryKey: TablePrimaryKeys, key: TablePrimaryKeysIndex): boolean {
    return primaryKey[key] != null;
}

function checkAll(mode: UpdationMode, primaryKey: TablePrimaryKeys, keys: TablePrimaryKeysIndex[]): void {
    for (const key of keys) {
        if (!check(primaryKey, key)) {
            throw new Error(`key ${key} is required for updation mode ${mode}`);
        }
    }
}

function checkAllBinder(mode: UpdationMode, keys: TablePrimaryKeysIndex[]) {
    return (primaryKey: TablePrimaryKeys) => checkAll(mode, primaryKey, keys);
}

// Helper function to build where clause from config and data
function getWhereClause(config: typeof tableConfig[UpdationMode], data: any): any {
    const primaryKeyColumns = Object.keys(config.primaryKey);

    const whereConditions = primaryKeyColumns.map(column =>
        eq((config.primaryKey as any)[column], (data as any)[column]),
    );

    return whereConditions.length === 1
        ? whereConditions[0]
        : and(...whereConditions);
}

const tableConfig = {
    card: {
        table:      Card,
        primaryKey: pick(getTableColumns(Card), ['cardId']),
        check:      checkAllBinder('card', ['cardId']),
        order:      [Card.cardId],
    },
    cardLocalization: {
        table:      CardLocalization,
        primaryKey: pick(getTableColumns(CardLocalization), ['cardId', 'lang']),
        check:      checkAllBinder('cardLocalization', ['cardId', 'lang']),
        order:      [CardLocalization.cardId, CardLocalization.lang],
    },
    cardPart: {
        table:      CardPart,
        primaryKey: pick(getTableColumns(CardPart), ['cardId', 'partIndex']),
        check:      checkAllBinder('cardPart', ['cardId', 'partIndex']),
        order:      [CardPart.cardId, CardPart.partIndex],
    },
    cardPartLocalization: {
        table:      CardPartLocalization,
        primaryKey: pick(getTableColumns(CardPartLocalization), ['cardId', 'partIndex', 'lang']),
        check:      checkAllBinder('cardPartLocalization', ['cardId', 'partIndex', 'lang']),
        order:      [CardPartLocalization.cardId, CardPartLocalization.partIndex, CardPartLocalization.lang],
    },
    print: {
        table:      Print,
        primaryKey: pick(getTableColumns(Print), ['cardId', 'lang', 'set', 'number']),
        check:      checkAllBinder('print', ['cardId', 'lang', 'set', 'number']),
        order:      [Print.cardId, Print.lang],
    },
    printPart: {
        table:      PrintPart,
        primaryKey: pick(getTableColumns(PrintPart), ['cardId', 'partIndex', 'lang', 'set', 'number']),
        check:      checkAllBinder('printPart', ['cardId', 'partIndex', 'lang', 'set', 'number']),
        order:      [PrintPart.cardId, PrintPart.partIndex, PrintPart.lang],
    },
} as const;

const getMinimal = os
    .input(z.object({
        mode:  updationMode,
        limit: z.int().min(0).max(200).default(0),
    }))
    .output(updationResponse)
    .handler(async ({ input }) => {
        const { mode, limit } = input;

        // Get table and column configuration
        const config = tableConfig[mode];

        const table = config.table;
        const updationsColumn = table.__updations;

        const keys = db.$with('keys').as(
            db.select({
                key:   sql<string>`u_elem->>'key'`.as('key'),
                count: sql<number>`COUNT(*)`.as('count'),
            })
                .from(table)
                .crossJoinLateral(sql`jsonb_array_elements(${updationsColumn}) AS u_elem`)
                .groupBy(sql`u_elem->>'key'`)
                .orderBy(qb => qb.count),
        );

        const minKey = db.$with('min_key').as(db.select({ key: keys.key, count: keys.count }).from(keys).limit(1));
        const totalCount = db.$with('total_count').as(db.select({ total: sql<number>`SUM(${keys.count})`.as('total') }).from(keys));

        const meta = await db
            .with(keys, minKey, totalCount)
            .select({
                total:   sql<number>`(SELECT total FROM ${totalCount})`.as('total'),
                key:     sql<string>`(SELECT key FROM ${minKey})`.as('key'),
                current: sql<number>`(SELECT count FROM ${minKey})`.as('current'),
            })
            .from(minKey)
            .then(rows => rows[0]);

        if (meta == null) {
            return {
                mode,
                total:   0,
                key:     '',
                current: 0,
                values:  [],
            };
        }

        const baseSelect = {
            key:      sql<string>`u_elem->>'key'`.as('key'),
            oldValue: sql<any>`u_elem->'oldValue'`.as('oldValue'),
            newValue: sql<any>`u_elem->'newValue'`.as('newValue'),
        };

        const query = db
            .select({ ...config.primaryKey, ...baseSelect })
            .from(table)
            .crossJoinLateral(sql`jsonb_array_elements(${updationsColumn}) AS u_elem`)
            .where(sql`u_elem->>'key' = ${meta.key}`)
            .orderBy(...config.order);

        const values = limit > 0 ? await query.limit(limit) : await query;

        return {
            mode,
            total:   Number(meta.total) || 0,
            key:     meta.key,
            current: Number(meta.current) || 0,
            values:  values ?? [],
        };
    });

const commit = os
    .input(updation.strip().omit({ oldValue: true, newValue: true }).extend({
        mode:   updationMode,
        action: z.enum(['accept', 'reject']),
    }))
    .output(z.boolean())
    .handler(async ({ input }) => {
        const { mode, action, key } = input;

        const config = tableConfig[mode];

        const table = config.table;

        // Validate required fields
        config.check(input);

        return await db.transaction(async tx => {
            const primaryKeyColumns = Object.keys(config.primaryKey);

            const whereClause = getWhereClause(config, input);

            const logParams = primaryKeyColumns
                .map(column => `${column}=${(input as any)[column]}`)
                .join(', ');

            // Acquire entry
            const entry = await tx.select()
                .from(table)
                .where(whereClause)
                .then(rows => rows[0]);

            if (entry == null) {
                return false;
            }

            // Process updations
            const updations = entry.__updations.filter((u: any) => u.key !== key);
            const firstUpdation = entry.__updations.find((u: any) => u.key === key);

            const updateData: any = { __updations: updations };

            if (action === 'reject' && firstUpdation) {
                updateData[key] = firstUpdation.oldValue;
                updateData['__lockedPaths'] = [...entry.__lockedPaths, key];
            }

            // Update database
            await tx.update(table).set(updateData).where(whereClause);

            // Log operation
            log.info(`commit-updation(${mode}), ${logParams}, key=${key}, action=${action}`);

            return true;
        });
    })
    .callable();

const accept = os
    .input(updation.strip().omit({ oldValue: true, newValue: true }).extend({ mode: updationMode }))
    .output(z.boolean())
    .handler(async ({ input }) => commit({ ...input, action: 'accept' }));

const reject = os
    .input(updation.strip().omit({ oldValue: true, newValue: true }).extend({ mode: updationMode }))
    .output(z.boolean())
    .handler(async ({ input }) => commit({ ...input, action: 'reject' }));

// Common batch operation helper function
async function processBatchAction(
    mode: UpdationMode,
    key: string,
    action: 'accept' | 'reject' | 'acceptUnchanged',
): Promise<boolean> {
    const matcher = JSON.stringify([{ key }]);

    const config = tableConfig[mode];
    const table = config.table;
    const updationsColumn = table.__updations;

    // Get all entries that have updations with the specified key
    const entries = await db.select()
        .from(table)
        .where(sql`${updationsColumn} @> ${matcher}`);

    for (const entry of entries) {
        const updations = entry.__updations.filter(u => u.key === key);

        if (action === 'acceptUnchanged') {
            if (!isEqual(updations[0]?.oldValue, (entry as any)[key])) {
                continue;
            }

            console.log(`Auto-accepting unchanged updation for ${mode} ${JSON.stringify(pick(entry, Object.keys(config.primaryKey)))} key ${key}`);
        }

        const firstUpdation = updations[0];
        const newUpdations = entry.__updations.filter(u => u.key !== key);

        const updateData: any = { __updations: newUpdations };

        if (action === 'reject' && firstUpdation != null) {
            updateData[key] = firstUpdation.oldValue;
            updateData['__lockedPaths'] = [...entry.__lockedPaths, key];
        }

        // Build where clause using primary key columns
        const whereClause = getWhereClause(config, entry);

        await db.update(table)
            .set(updateData)
            .where(whereClause);
    }

    return true;
}

const acceptUnchanged = os
    .input(z.object({ mode: updationMode, key: z.string() }))
    .output(z.boolean())
    .handler(async ({ input }) => await processBatchAction(input.mode, input.key, 'acceptUnchanged'));

const acceptAll = os
    .input(z.object({ mode: updationMode, key: z.string() }))
    .output(z.boolean())
    .handler(async ({ input }) => await processBatchAction(input.mode, input.key, 'accept'));

const rejectAll = os
    .input(z.object({ mode: updationMode, key: z.string() }))
    .output(z.boolean())
    .handler(async ({ input }) => await processBatchAction(input.mode, input.key, 'reject'));

export const updationTrpc = {
    getMinimal,
    commit,
    accept,
    reject,
    acceptUnchanged,
    acceptAll,
    rejectAll,
};
