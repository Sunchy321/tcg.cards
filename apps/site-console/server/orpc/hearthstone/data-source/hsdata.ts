import { ORPCError } from '@orpc/server';
import { os } from '#server/orpc';
import { z } from 'zod';
import { desc, sql } from 'drizzle-orm';

import { db } from '#db/db';
import {
  RawEntitySnapshot,
  RawEntitySnapshotTag,
  SourceVersion,
  TagValueView,
} from '#schema/hearthstone';
import { importHsdata } from '~~/server/lib/hearthstone/hsdata-import';
import { projectHsdata } from '~~/server/lib/hearthstone/hsdata-project';

const hsdataDataPrefix = 'hearthstone/hsdata/data/';
const hsdataArchiveFileName = /^(\d{4,})-([a-z0-9][a-z0-9-]*)\.xml$/i;

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

const hsdataFileInput = z.object({
  name: z.string().min(1).max(1024),
});

const hsdataImportInput = hsdataFileInput.extend({
  dryRun: z.boolean().optional(),
  force:  z.boolean().optional(),
});

const hsdataImportReport = z.object({
  dryRun:                z.boolean(),
  skipped:               z.boolean(),
  sourceTag:             z.number().int().positive(),
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

const hsdataProjectInput = z.object({
  sourceTag: z.number().int().positive(),
  dryRun:    z.boolean().optional(),
  force:     z.boolean().optional(),
});

const hsdataProjectReport = z.object({
  dryRun:                z.boolean(),
  skipped:               z.boolean(),
  sourceTag:             z.number().int().positive(),
  build:                 z.number().int().nonnegative(),
  snapshotCount:         z.number().int().nonnegative(),
  insertedEntities:      z.number().int().nonnegative(),
  reusedEntities:        z.number().int().nonnegative(),
  updatedEntities:       z.number().int().nonnegative(),
  insertedLocalizations: z.number().int().nonnegative(),
  reusedLocalizations:   z.number().int().nonnegative(),
  updatedLocalizations:  z.number().int().nonnegative(),
  insertedRelations:     z.number().int().nonnegative(),
  updatedRelations:      z.number().int().nonnegative(),
  unprojectedTagCount:   z.number().int().nonnegative(),
});

const hsdataOverview = z.object({
  summary: z.object({
    sourceVersionCount:          z.number().int().nonnegative(),
    completedSourceVersionCount: z.number().int().nonnegative(),
    failedSourceVersionCount:    z.number().int().nonnegative(),
    snapshotCount:               z.number().int().nonnegative(),
    latestSnapshotCount:         z.number().int().nonnegative(),
    tagRowCount:                 z.number().int().nonnegative(),
  }),
  tables: z.object({
    sourceVersions: z.object({
      name:                     z.literal('source_versions'),
      kind:                     z.literal('table'),
      rows:                     z.number().int().nonnegative(),
      latestImportedAt:         z.string().optional(),
      latestCompletedSourceTag: z.number().int().positive().optional(),
      statusCounts:             z.object({
        completed:  z.number().int().nonnegative(),
        failed:     z.number().int().nonnegative(),
        processing: z.number().int().nonnegative(),
        pending:    z.number().int().nonnegative(),
      }),
    }),
    rawEntitySnapshots: z.object({
      name:              z.literal('raw_entity_snapshots'),
      kind:              z.literal('table'),
      rows:              z.number().int().nonnegative(),
      latestRows:        z.number().int().nonnegative(),
      distinctCardCount: z.number().int().nonnegative(),
      updatedAt:         z.string().optional(),
    }),
    rawEntitySnapshotTags: z.object({
      name:                  z.literal('raw_entity_snapshot_tags'),
      kind:                  z.literal('table'),
      rows:                  z.number().int().nonnegative(),
      distinctSnapshotCount: z.number().int().nonnegative(),
      distinctEnumCount:     z.number().int().nonnegative(),
    }),
    tagValueView: z.object({
      name:                  z.literal('tag_value_view'),
      kind:                  z.literal('view'),
      rows:                  z.number().int().nonnegative(),
      distinctSnapshotCount: z.number().int().nonnegative(),
      distinctEnumCount:     z.number().int().nonnegative(),
    }),
  }),
});

function normalizeFileName(name: string): string {
  const normalized = name.trim();

  if (
    normalized.length === 0
    || normalized.startsWith('/')
    || normalized.split('/').includes('..')
    || Array.from(normalized).some(char => (char.codePointAt(0) ?? 0) < 0x20)
  ) {
    throw new ORPCError('BAD_REQUEST', { message: 'Invalid hsdata file name' });
  }

  return normalized;
}

function parsePositiveInteger(rawValue: string | undefined) {
  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function inferHsdataSourceTag(name: string) {
  const archiveMatch = name.match(hsdataArchiveFileName);
  const fallbackMatch = name.match(/(?:^|[^\d])(\d{5,})(?:[^\d]|$)/);

  return parsePositiveInteger(archiveMatch?.[1] ?? fallbackMatch?.[1]);
}

function inferHsdataSourceCommit(name: string) {
  const commit = name.match(hsdataArchiveFileName)?.[2]?.toLowerCase();
  return commit && commit !== 'local' ? commit : null;
}

function inferHsdataBuild(xml: string) {
  const rootMatch = xml.match(/<CardDefs\b[^>]*\bbuild="(\d+)"/);
  const fallbackMatch = xml.match(/\bbuild="(\d+)"/);

  return parsePositiveInteger(rootMatch?.[1] ?? fallbackMatch?.[1]);
}

function normalizeCount(value: number | string | null | undefined) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  }

  return 0;
}

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  return value.toISOString();
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

const getOverview = os
  .route({
    method:      'GET',
    description: 'Get hsdata data table overview',
    tags:        ['Console', 'Hearthstone', 'DataSource'],
  })
  .input(z.void())
  .output(hsdataOverview)
  .handler(async () => {
    const [
      sourceVersionSummary,
      latestCompletedSourceVersion,
      snapshotSummary,
      snapshotTagSummary,
      tagValueSummary,
    ] = await Promise.all([
      db.select({
        rows:       sql<number>`cast(count(*) as integer)`,
        completed:  sql<number>`cast(coalesce(sum(case when ${SourceVersion.status} = 'completed' then 1 else 0 end), 0) as integer)`,
        failed:     sql<number>`cast(coalesce(sum(case when ${SourceVersion.status} = 'failed' then 1 else 0 end), 0) as integer)`,
        processing: sql<number>`cast(coalesce(sum(case when ${SourceVersion.status} = 'processing' then 1 else 0 end), 0) as integer)`,
        pending:    sql<number>`cast(coalesce(sum(case when ${SourceVersion.status} = 'pending' then 1 else 0 end), 0) as integer)`,
      })
        .from(SourceVersion)
        .then(rows => rows[0]!),

      db.select({
        sourceTag:  SourceVersion.sourceTag,
        importedAt: SourceVersion.importedAt,
      })
        .from(SourceVersion)
        .where(sql<boolean>`${SourceVersion.status} = 'completed'`)
        .orderBy(desc(SourceVersion.importedAt), desc(SourceVersion.sourceTag))
        .limit(1)
        .then(rows => rows[0]),

      db.select({
        rows:              sql<number>`cast(count(*) as integer)`,
        latestRows:        sql<number>`cast(coalesce(sum(case when ${RawEntitySnapshot.isLatest} then 1 else 0 end), 0) as integer)`,
        distinctCardCount: sql<number>`cast(count(distinct ${RawEntitySnapshot.cardId}) as integer)`,
        updatedAt:         sql<Date | null>`max(${RawEntitySnapshot.updatedAt})`,
      })
        .from(RawEntitySnapshot)
        .then(rows => rows[0]!),

      db.select({
        rows:                  sql<number>`cast(count(*) as integer)`,
        distinctSnapshotCount: sql<number>`cast(count(distinct ${RawEntitySnapshotTag.snapshotId}) as integer)`,
        distinctEnumCount:     sql<number>`cast(count(distinct ${RawEntitySnapshotTag.enumId}) as integer)`,
      })
        .from(RawEntitySnapshotTag)
        .then(rows => rows[0]!),

      db.select({
        rows:                  sql<number>`cast(count(*) as integer)`,
        distinctSnapshotCount: sql<number>`cast(count(distinct ${TagValueView.snapshotId}) as integer)`,
        distinctEnumCount:     sql<number>`cast(count(distinct ${TagValueView.enumId}) as integer)`,
      })
        .from(TagValueView)
        .then(rows => rows[0]!),
    ]);

    return {
      summary: {
        sourceVersionCount:          normalizeCount(sourceVersionSummary.rows),
        completedSourceVersionCount: normalizeCount(sourceVersionSummary.completed),
        failedSourceVersionCount:    normalizeCount(sourceVersionSummary.failed),
        snapshotCount:               normalizeCount(snapshotSummary.rows),
        latestSnapshotCount:         normalizeCount(snapshotSummary.latestRows),
        tagRowCount:                 normalizeCount(snapshotTagSummary.rows),
      },
      tables: {
        sourceVersions: {
          name:                     'source_versions',
          kind:                     'table',
          rows:                     normalizeCount(sourceVersionSummary.rows),
          latestImportedAt:         normalizeDate(latestCompletedSourceVersion?.importedAt),
          latestCompletedSourceTag: latestCompletedSourceVersion?.sourceTag ?? undefined,
          statusCounts:             {
            completed:  normalizeCount(sourceVersionSummary.completed),
            failed:     normalizeCount(sourceVersionSummary.failed),
            processing: normalizeCount(sourceVersionSummary.processing),
            pending:    normalizeCount(sourceVersionSummary.pending),
          },
        },
        rawEntitySnapshots: {
          name:              'raw_entity_snapshots',
          kind:              'table',
          rows:              normalizeCount(snapshotSummary.rows),
          latestRows:        normalizeCount(snapshotSummary.latestRows),
          distinctCardCount: normalizeCount(snapshotSummary.distinctCardCount),
          updatedAt:         normalizeDate(snapshotSummary.updatedAt),
        },
        rawEntitySnapshotTags: {
          name:                  'raw_entity_snapshot_tags',
          kind:                  'table',
          rows:                  normalizeCount(snapshotTagSummary.rows),
          distinctSnapshotCount: normalizeCount(snapshotTagSummary.distinctSnapshotCount),
          distinctEnumCount:     normalizeCount(snapshotTagSummary.distinctEnumCount),
        },
        tagValueView: {
          name:                  'tag_value_view',
          kind:                  'view',
          rows:                  normalizeCount(tagValueSummary.rows),
          distinctSnapshotCount: normalizeCount(tagValueSummary.distinctSnapshotCount),
          distinctEnumCount:     normalizeCount(tagValueSummary.distinctEnumCount),
        },
      },
    };
  });

const importArchive = os
  .route({
    method:      'POST',
    description: 'Import one hsdata XML snapshot from R2 into Hearthstone raw archive tables',
    tags:        ['Console', 'Hearthstone', 'DataSource'],
  })
  .input(hsdataImportInput)
  .output(hsdataImportReport)
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

    const xml = await object.text();
    const sourceTag = inferHsdataSourceTag(name) ?? inferHsdataBuild(xml);

    if (sourceTag == null) {
      throw new ORPCError('BAD_REQUEST', { message: `Cannot infer sourceTag from hsdata file: ${name}` });
    }

    try {
      return await importHsdata({
        xml,
        sourceTag,
        sourceCommit: inferHsdataSourceCommit(name),
        sourceUri:    `r2://R2_DATA/${hsdataDataPrefix}${name}`,
        dryRun:       input.dryRun,
        force:        input.force,
      });
    } catch (error) {
      if (error instanceof Error) {
        const code = error.message.includes('force=true') ? 'CONFLICT' : 'BAD_REQUEST';
        throw new ORPCError(code, { message: error.message });
      }

      throw error;
    }
  });

const projectSourceVersion = os
  .route({
    method:      'POST',
    description: 'Project one completed hsdata source version into Hearthstone domain tables',
    tags:        ['Console', 'Hearthstone', 'DataSource'],
  })
  .input(hsdataProjectInput)
  .output(hsdataProjectReport)
  .handler(async ({ input }) => {
    try {
      return await projectHsdata({
        sourceTag: input.sourceTag,
        dryRun:    input.dryRun,
        force:     input.force,
      });
    } catch (error) {
      if (error instanceof Error) {
        const message = error.message;
        const code = message.includes('does not exist')
          ? 'NOT_FOUND'
          : message.includes('not completed')
            ? 'CONFLICT'
            : 'BAD_REQUEST';

        throw new ORPCError(code, { message });
      }

      throw error;
    }
  });

export const hsdataTrpc = {
  getState,
  listFiles,
  getOverview,
  importArchive,
  projectSourceVersion,
};
