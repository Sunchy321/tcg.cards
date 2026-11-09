import { gameDataPermission } from '@tcg-cards/auth';
import { ORPCError, os as create } from '@orpc/server';
import { z } from 'zod';
import type { D1Database } from '@cloudflare/workers-types';

/** Authenticated account supplied by the service after checking its session. */
type SearchD1Account = { id: string, role?: string | null };

/** One verified release attributed to the authenticated account. */
export type SearchD1PublicationAudit = {
  game:        'magic' | 'hearthstone';
  taskRunId:   string;
  userId:      string;
  dataVersion: string;
  releaseHash: string;
};

const os = create.$context<{
  account:     SearchD1Account | null;
  recordAudit: (audit: SearchD1PublicationAudit) => Promise<void>;
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
  success:     z.boolean(),
  durationMs:  z.number().optional(),
  rowsRead:    z.number().optional(),
  rowsWritten: z.number().optional(),
  rows:        z.array(z.record(z.string(), z.unknown())),
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

/** Rejects calls before they reach either search database binding. */
function requireSearchD1Permission(account: SearchD1Account | null, game: z.infer<typeof searchD1GameInput>) {
  if (!account) {
    throw new ORPCError('UNAUTHORIZED', { message: '请先登录控制台服务。' });
  }
  if (!gameDataPermission(account.role, game)) {
    throw new ORPCError('FORBIDDEN', { message: '当前账号没有发布该游戏数据的权限。' });
  }
  return account;
}

/** Reads the release identity from the bound search database. */
async function readSearchD1Meta(database: D1Database, game: z.infer<typeof searchD1GameInput>) {
  try {
    const rows = await database.prepare(`SELECT key, value FROM ${SEARCH_META_TABLES[game]}`).all<{ key: string, value: string }>();
    return Object.fromEntries(rows.results.map(row => [row.key, row.value]));
  } catch (error) {
    throw new ORPCError('INTERNAL_SERVER_ERROR', {
      message: error instanceof Error ? error.message : 'The search database metadata could not be read.',
    });
  }
}

const searchD1Execute = os
  .input(searchD1ExecuteInput)
  .output(searchD1ExecuteOutput)
  .handler(async ({ context, input }) => {
    requireSearchD1Permission(context.account, input.game);
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
        success:     result.success,
        durationMs:  result.meta?.duration,
        rowsRead:    result.meta?.rows_read,
        rowsWritten: result.meta?.rows_written,
        rows:        (result.results ?? []).map(row => Object.fromEntries(Object.entries(row as Record<string, unknown>).map(
          ([key, value]) => [key, value instanceof Date ? value.toISOString() : value],
        ))),
      })),
    };
  });

const searchD1Meta = os
  .input(searchD1MetaInput)
  .output(searchD1MetaOutput)
  .handler(async ({ context, input }) => {
    requireSearchD1Permission(context.account, input.game);
    const database = input.game === 'magic' ? context.env.MAGIC_SEARCH_DB : context.env.HEARTHSTONE_SEARCH_DB;
    return { values: await readSearchD1Meta(database, input.game) };
  });

const searchD1RecordPublication = os
  .input(z.object({
    game:          searchD1GameInput,
    taskRunId:     z.uuid(),
    dataVersion:   z.string().min(1),
    releaseHash:   z.string().regex(/^[a-f0-9]{64}$/),
    schemaVersion: z.string().regex(/^\d+$/),
  }))
  .output(z.object({ recorded: z.literal(true) }))
  .handler(async ({ context, input }) => {
    const account = requireSearchD1Permission(context.account, input.game);
    const database = input.game === 'magic' ? context.env.MAGIC_SEARCH_DB : context.env.HEARTHSTONE_SEARCH_DB;
    const values = await readSearchD1Meta(database, input.game);
    if (values.ready !== '1'
      || values.data_version !== input.dataVersion
      || values.release_hash !== input.releaseHash
      || values.schema_version !== input.schemaVersion) {
      throw new ORPCError('CONFLICT', { message: '远程搜索库版本已变化，无法记录本次发布。' });
    }
    await context.recordAudit({
      game:        input.game,
      taskRunId:   input.taskRunId,
      userId:      account.id,
      dataVersion: input.dataVersion,
      releaseHash: input.releaseHash,
    });
    return { recorded: true as const };
  });

/** Search publication procedures served only by the internal console backend. */
export const searchD1Router = {
  searchD1: { execute: searchD1Execute, meta: searchD1Meta, recordPublication: searchD1RecordPublication },
};

export type SearchD1Router = typeof searchD1Router;
