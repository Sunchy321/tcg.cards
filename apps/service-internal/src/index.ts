import { Hono } from 'hono';
import { RPCHandler } from '@orpc/server/fetch';
import { onError } from '@orpc/server';
import { createDb, runWithDb } from '@tcg-cards/db';
import { getHsdataImportJobErrorCode, uploadHsdataImportChunk } from '@tcg-cards/console-api';
import { z } from 'zod';

import { getAuth } from './auth';
import { router } from './orpc/service';

import type { InternalServiceEnv } from './env';

const hono = new Hono<{
  Bindings: InternalServiceEnv;
}>();

const HSDATA_UPLOAD_IMPORT_CHUNK_PATH = '/rpc/hearthstone/dataSource/hsdata/uploadImportChunk';
const HSDATA_UPLOAD_IMPORT_CHUNK_CONTENT_TYPE = 'application/x-ndjson';
const HSDATA_UPLOAD_IMPORT_CHUNK_CONTENT_ENCODING = 'gzip';
const HSDATA_UPLOAD_IMPORT_CHUNK_JOB_ID_QUERY = 'jobId';
const HSDATA_UPLOAD_IMPORT_CHUNK_INDEX_QUERY = 'chunkIndex';
const HSDATA_UPLOAD_IMPORT_CHUNK_PAYLOAD_HASH_HEADER = 'x-hsdata-payload-hash';
const HSDATA_UPLOAD_IMPORT_CHUNK_ENTITY_COUNT_HEADER = 'x-hsdata-entity-count';

const hsdataUploadImportChunkQuery = z.object({
  jobId:      z.uuid(),
  chunkIndex: z.coerce.number().int().nonnegative(),
});

const hsdataUploadImportChunkHeaders = z.object({
  payloadHash: z.string().trim().min(1),
  entityCount: z.coerce.number().int().positive(),
});

/** Query and header metadata required by one raw hsdata chunk upload request. */
interface HsdataUploadImportChunkRequestMetadata {
  jobId:       string;
  chunkIndex:  number;
  payloadHash: string;
  entityCount: number;
}

function installRuntimeBindings(env: InternalServiceEnv) {
  const runtimeGlobal = globalThis as typeof globalThis & {
    __env__?:    InternalServiceEnv;
    HYPERDRIVE?: InternalServiceEnv['HYPERDRIVE'];
  };

  runtimeGlobal.__env__ = env;
  runtimeGlobal.HYPERDRIVE = env.HYPERDRIVE;
}

const rpcHandler = new RPCHandler(router as any, {
  interceptors: [
    onError(error => {
      console.error('[orpc] error:', error);
    }),
  ],
});

/** Error responses encoded as the lightweight JSON shape expected by desktop callers. */
function jsonErrorResponse(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

/** Whitespace-trimmed header values normalized to null when absent. */
function trimHeaderValue(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

/** Raw hsdata chunk upload query and headers validated into service input metadata. */
function parseHsdataUploadImportChunkRequestMetadata(request: Request): HsdataUploadImportChunkRequestMetadata {
  const url = new URL(request.url);
  const queryResult = hsdataUploadImportChunkQuery.safeParse({
    jobId:      url.searchParams.get(HSDATA_UPLOAD_IMPORT_CHUNK_JOB_ID_QUERY),
    chunkIndex: url.searchParams.get(HSDATA_UPLOAD_IMPORT_CHUNK_INDEX_QUERY),
  });

  if (!queryResult.success) {
    throw new Error('Invalid uploadImportChunk query parameters');
  }

  const contentType = trimHeaderValue(request.headers.get('content-type'));
  if (contentType == null || !contentType.toLowerCase().startsWith(HSDATA_UPLOAD_IMPORT_CHUNK_CONTENT_TYPE)) {
    throw new Error(`uploadImportChunk requires Content-Type: ${HSDATA_UPLOAD_IMPORT_CHUNK_CONTENT_TYPE}`);
  }

  const contentEncoding = trimHeaderValue(request.headers.get('content-encoding'));
  if (contentEncoding !== HSDATA_UPLOAD_IMPORT_CHUNK_CONTENT_ENCODING) {
    throw new Error(`uploadImportChunk requires Content-Encoding: ${HSDATA_UPLOAD_IMPORT_CHUNK_CONTENT_ENCODING}`);
  }

  const headerResult = hsdataUploadImportChunkHeaders.safeParse({
    payloadHash: trimHeaderValue(request.headers.get(HSDATA_UPLOAD_IMPORT_CHUNK_PAYLOAD_HASH_HEADER)),
    entityCount: trimHeaderValue(request.headers.get(HSDATA_UPLOAD_IMPORT_CHUNK_ENTITY_COUNT_HEADER)),
  });

  if (!headerResult.success) {
    throw new Error('Invalid uploadImportChunk headers');
  }

  return {
    jobId:       queryResult.data.jobId,
    chunkIndex:  queryResult.data.chunkIndex,
    payloadHash: headerResult.data.payloadHash,
    entityCount: headerResult.data.entityCount,
  };
}

/** Gzip-compressed request bodies decoded into canonical NDJSON text. */
async function readGzipRequestText(request: Request): Promise<string> {
  if (request.body == null) {
    throw new Error('uploadImportChunk request body is required');
  }

  try {
    const decoded = request.body.pipeThrough(new DecompressionStream('gzip'));
    return await new Response(decoded).text();
  } catch (error) {
    const err = new Error(
      error instanceof Error
        ? `Failed to decompress gzip chunk payload: ${error.message}`
        : 'Failed to decompress gzip chunk payload',
    );

    err.cause = error;

    throw err;
  }
}

/** Raw hsdata chunk uploads translated into the shared staged import service call. */
async function handleHsdataUploadImportChunkRequest(request: Request): Promise<Response> {
  try {
    const metadata = parseHsdataUploadImportChunkRequestMetadata(request);
    const payload = await readGzipRequestText(request);
    const result = await uploadHsdataImportChunk({
      jobId:       metadata.jobId,
      chunkIndex:  metadata.chunkIndex,
      entityCount: metadata.entityCount,
      payloadHash: metadata.payloadHash,
      payload,
    });

    return new Response(JSON.stringify(result), {
      status:  200,
      headers: {
        'content-type': 'application/json',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = getHsdataImportJobErrorCode(message);
    const status = code === 'NOT_FOUND'
      ? 404
      : code === 'CONFLICT'
        ? 409
        : 400;

    return jsonErrorResponse(status, code, message);
  }
}

hono.get('/', c => c.json({
  service: 'service-internal',
  status:  'ok',
  auth:    'better-auth',
}));

hono.get('/health', c => c.json({
  service: 'service-internal',
  status:  'ok',
  time:    new Date().toISOString(),
}));

async function handleAuthRequest(request: Request, env: InternalServiceEnv) {
  // Recreate the request inside the current handler context to avoid
  // Cloudflare Worker I/O ownership issues when downstream code reads the body.
  const authRequest = new Request(request);
  return await getAuth(env, { baseURL: new URL(authRequest.url).origin }).handler(authRequest);
}

type ClosableDb = ReturnType<typeof createDb> & {
  $client: {
    end(options?: { timeout?: number | null }): Promise<unknown>;
  };
};

async function withRequestDb<T>(env: InternalServiceEnv, handler: () => Promise<T>): Promise<T> {
  const database = createDb(env.HYPERDRIVE.connectionString) as ClosableDb;

  try {
    return await runWithDb(database, handler);
  } finally {
    await database.$client.end({ timeout: 0 });
  }
}

hono.all('/auth/*', async c => {
  installRuntimeBindings(c.env);
  return await withRequestDb(c.env, async () => await handleAuthRequest(c.req.raw, c.env));
});

hono.post(HSDATA_UPLOAD_IMPORT_CHUNK_PATH, async c => {
  installRuntimeBindings(c.env);
  return await withRequestDb(c.env, async () => await handleHsdataUploadImportChunkRequest(c.req.raw));
});

hono.all('/rpc/*', async c => {
  installRuntimeBindings(c.env);
  const { response } = await withRequestDb(c.env, async () => await rpcHandler.handle(c.req.raw, {
    prefix:  '/rpc',
    context: { env: c.env },
  }));
  return response ?? c.notFound();
});

export default hono;
