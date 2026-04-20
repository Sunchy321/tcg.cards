import { ORPCError } from '@orpc/server';
import { os } from '#server/orpc';
import { z } from 'zod';

import { importHsdata } from '~~/server/lib/hearthstone/hsdata-import';

const hsdataDataPrefix = 'hearthstone/hsdata/data/';

const dataSourceState = z.object({
  tag:        z.string().optional(),
  commit:     z.string().optional(),
  short:      z.string().optional(),
  synced_at:  z.string().optional(),
  type:       z.string().optional(),
  file_count: z.number().optional(),
  history:    z.array(z.object({
    tag:    z.string(),
    commit: z.string(),
    type:   z.string(),
    date:   z.string(),
    count:  z.number().optional(),
    size:   z.number().optional(),
  })).optional(),
});

const hsdataImportInput = z.object({
  xml:          z.string().min(1),
  sourceTag:    z.number().int().nonnegative(),
  sourceCommit: z.string().nullable().optional(),
  sourceUri:    z.string().nullable().optional(),
  dryRun:       z.boolean().optional(),
  force:        z.boolean().optional(),
});

const hsdataFileInput = z.object({
  name: z.string().min(1).max(1024),
});

const hsdataFileContent = z.object({
  name:    z.string(),
  size:    z.number(),
  time:    z.string().optional(),
  content: z.string(),
});

const hsdataImportReport = z.object({
  dryRun:                z.boolean(),
  skipped:               z.boolean(),
  sourceTag:             z.number().int().nonnegative(),
  build:                 z.number().int().nonnegative(),
  sourceHash:            z.string(),
  entityCount:           z.number().int().nonnegative(),
  insertedSnapshots:     z.number().int().nonnegative(),
  reusedSnapshots:       z.number().int().nonnegative(),
  insertedTagRows:       z.number().int().nonnegative(),
  discoveredTagCount:    z.number().int().nonnegative(),
  updatedDiscoveredTags: z.number().int().nonnegative(),
  fallbackTagRowCount:   z.number().int().nonnegative(),
  latestSnapshotCount:   z.number().int().nonnegative(),
  discoveredTags:        z.array(z.number().int().nonnegative()),
});

function normalizeFileName(name: string): string {
  const normalized = name.trim();

  if (
    normalized.length === 0
    || normalized.startsWith('/')
    || normalized.split('/').includes('..')
    || /[\u0000-\u001f]/u.test(normalized)
  ) {
    throw new ORPCError('BAD_REQUEST', { message: 'Invalid hsdata file name' });
  }

  return normalized;
}

const getState = os
  .route({
    method:      'GET',
    description: 'Get hsdata sync state from R2',
    tags:        ['Console', 'Hearthstone', 'DataSource'],
  })
  .input(z.void())
  .output(dataSourceState.nullable())
  .handler(async ({ context }) => {
    try {
      const env = context.env;
      const object = await env?.R2_DATA?.get('hearthstone/hsdata/state.json');

      if (!object) {
        return null;
      }

      const payload = JSON.parse(await object.text()) as unknown;
      return dataSourceState.parse(payload);
    } catch {
      return null;
    }
  });

const listFiles = os
  .route({
    method:      'GET',
    description: 'List hsdata files from R2',
    tags:        ['Console', 'Hearthstone', 'DataSource'],
  })
  .input(z.void())
  .output(z.array(z.object({
    name: z.string(),
    size: z.number(),
    time: z.string().optional(),
  })))
  .handler(async ({ context }) => {
    try {
      const env = context.env;
      const bucket = env?.R2_DATA;

      if (!bucket) {
        return [];
      }

      const files: Array<{
        name:  string;
        size:  number;
        time?: string;
      }> = [];
      let cursor: string | undefined;

      do {
        const listResult = await bucket.list({
          prefix: hsdataDataPrefix,
          ...(cursor ? { cursor } : {}),
        });

        for (const object of listResult.objects ?? []) {
          const name = object.key.startsWith(hsdataDataPrefix)
            ? object.key.slice(hsdataDataPrefix.length)
            : object.key;

          if (name.length === 0) {
            continue;
          }

          files.push({
            name: name,
            size: object.size,
            time: object.uploaded?.toISOString(),
          });
        }

        cursor = listResult.truncated ? listResult.cursor : undefined;
      } while (cursor);

      return files;
    } catch {
      return [];
    }
  });

const readFile = os
  .route({
    method:      'POST',
    description: 'Read one hsdata XML file from R2',
    tags:        ['Console', 'Hearthstone', 'DataSource'],
  })
  .input(hsdataFileInput)
  .output(hsdataFileContent)
  .handler(async ({ context, input }) => {
    const env = context.env;
    const bucket = env?.R2_DATA;

    if (!bucket) {
      throw new ORPCError('NOT_FOUND', { message: 'R2_DATA bucket is not configured' });
    }

    const name = normalizeFileName(input.name);
    const object = await bucket.get(`${hsdataDataPrefix}${name}`);

    if (!object) {
      throw new ORPCError('NOT_FOUND', { message: `hsdata file not found: ${name}` });
    }

    return {
      name,
      size:    object.size,
      time:    object.uploaded?.toISOString(),
      content: await object.text(),
    };
  });

const importArchive = os
  .route({
    method:      'POST',
    description: 'Import one hsdata XML snapshot into Hearthstone raw archive tables',
    tags:        ['Console', 'Hearthstone', 'DataSource'],
  })
  .input(hsdataImportInput)
  .output(hsdataImportReport)
  .handler(async ({ input }) => {
    try {
      return await importHsdata(input);
    } catch (error) {
      if (error instanceof Error) {
        const code = error.message.includes('force=true') ? 'CONFLICT' : 'BAD_REQUEST';
        throw new ORPCError(code, { message: error.message });
      }

      throw error;
    }
  });

export const hsdataTrpc = {
  getState,
  listFiles,
  readFile,
  importArchive,
};
