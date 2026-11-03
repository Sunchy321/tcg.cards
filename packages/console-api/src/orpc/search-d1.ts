import { ORPCError, os as create } from '@orpc/server';
import { z } from 'zod';
import type { D1Database } from '@cloudflare/workers-types';

const os = create.$context<{
  env: {
    MAGIC_SEARCH_DB:       D1Database;
    HEARTHSTONE_SEARCH_DB: D1Database;
  };
}>();

const searchD1GameInput = z.enum(['magic', 'hearthstone']);

const searchD1ExecuteInput = z.object({
  game:       searchD1GameInput,
  statements: z.array(z.string().min(1)).min(1).max(2000),
});

const searchD1StatementResult = z.object({
  success:    z.boolean(),
  durationMs: z.number().optional(),
  rowsRead:   z.number().optional(),
  rowsWritten: z.number().optional(),
  rows:       z.array(z.record(z.string(), z.unknown())),
});

const searchD1ExecuteOutput = z.object({
  results: z.array(searchD1StatementResult),
});

const searchD1MetaInput = z.object({ game: searchD1GameInput });

const searchD1MetaOutput = z.object({
  values: z.record(z.string(), z.string()),
});

const SEARCH_META_TABLES = {
  magic:       'magic_search_meta',
  hearthstone: 'hearthstone_search_meta',
} as const;

const searchD1Execute = os
  .input(searchD1ExecuteInput)
  .output(searchD1ExecuteOutput)
  .handler(async ({ context, input }) => {
    const database = input.game === 'magic' ? context.env.MAGIC_SEARCH_DB : context.env.HEARTHSTONE_SEARCH_DB;
    let results;
    try {
      results = await database.batch(input.statements.map(text => database.prepare(text)));
    } catch (error) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: error instanceof Error ? error.message : 'The search database rejected the statement batch.',
      });
    }
    return {
      results: results.map(result => ({
        success:    result.success,
        durationMs: result.meta?.duration,
        rowsRead:   result.meta?.rows_read,
        rowsWritten: result.meta?.rows_written,
        rows:       (result.results ?? []).map(row => Object.fromEntries(Object.entries(row as Record<string, unknown>).map(
          ([key, value]) => [key, value instanceof Date ? value.toISOString() : value],
        ))),
      })),
    };
  });

const searchD1Meta = os
  .input(searchD1MetaInput)
  .output(searchD1MetaOutput)
  .handler(async ({ context, input }) => {
    const database = input.game === 'magic' ? context.env.MAGIC_SEARCH_DB : context.env.HEARTHSTONE_SEARCH_DB;
    let rows;
    try {
      rows = await database.prepare(`SELECT key, value FROM ${SEARCH_META_TABLES[input.game]}`).all<{ key: string, value: string }>();
    } catch (error) {
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: error instanceof Error ? error.message : 'The search database metadata could not be read.',
      });
    }
    return {
      values: Object.fromEntries(rows.results.map(row => [row.key, row.value])),
    };
  });

/** Search publication procedures served only by the internal console backend. */
export const searchD1Router = {
  searchD1: { execute: searchD1Execute, meta: searchD1Meta },
};

export type SearchD1Router = typeof searchD1Router;
