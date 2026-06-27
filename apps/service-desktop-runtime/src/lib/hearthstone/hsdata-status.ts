import { desc, eq, sql } from 'drizzle-orm';

import {
  HsdataImportJob,
  RawEntitySnapshot,
  RawEntitySnapshotTag,
  SourceVersion,
} from '@tcg-cards/db/schema/local/hearthstone';

import { getLocalDb } from './hsdata-local-db';

/** One local source version row returned to the desktop frontend. */
export interface HsdataSourceVersionStatus {
  sourceTag: number;
  build: number | null;
  sourceCommit: string;
  sourceUri: string;
  importStatus: string;
  importedAt: string | null;
  projectionStatus: string;
  projectedAt: string | null;
  projectionError: string | null;
}

/** Import state counters grouped for the overview page. */
export interface HsdataStatusCounts {
  completed: number;
  failed: number;
  processing: number;
  pending: number;
}

/** source_versions overview card returned to the desktop frontend. */
export interface HsdataSourceVersionOverview {
  name: 'source_versions';
  kind: 'table';
  rows: number;
  latestImportedAt?: string;
  latestCompletedSourceTag?: number;
  statusCounts: HsdataStatusCounts;
}

/** raw_entity_snapshots overview card returned to the desktop frontend. */
export interface HsdataRawEntitySnapshotOverview {
  name: 'raw_entity_snapshots';
  kind: 'table';
  rows: number;
  projectedRows: number;
  unprojectedRows: number;
  distinctCardCount: number;
  updatedAt?: string;
}

/** raw_entity_snapshot_tags overview card returned to the desktop frontend. */
export interface HsdataRawEntitySnapshotTagOverview {
  name: 'raw_entity_snapshot_tags';
  kind: 'table';
  rows: number;
  distinctSnapshotCount: number;
  distinctEnumCount: number;
}

/** tag_value_view overview card returned to the desktop frontend. */
export interface HsdataTagValueViewOverview {
  name: 'tag_value_view';
  kind: 'view';
  rows: number;
  distinctSnapshotCount: number;
  distinctEnumCount: number;
}

/** Aggregate overview payload returned to the desktop frontend. */
export interface HsdataOverview {
  summary: {
    sourceVersionCount: number;
    completedSourceVersionCount: number;
    failedSourceVersionCount: number;
    snapshotCount: number;
    tagRowCount: number;
  };
  tables: {
    sourceVersions: HsdataSourceVersionOverview;
    rawEntitySnapshots: HsdataRawEntitySnapshotOverview;
    rawEntitySnapshotTags: HsdataRawEntitySnapshotTagOverview;
    tagValueView: HsdataTagValueViewOverview;
  };
}

/** Import job state returned for the current runtime-side hsdata import. */
export interface HsdataImportJobSnapshot {
  jobId: string;
  sourceTag: number;
  build: number;
  sourceHash: string;
  dryRun: boolean;
  force: boolean;
  status: string;
  stagingCleanupStatus: string;
  totalBatchCount: number;
  completedBatchCount: number;
  failedBatchCount: number;
  processingBatchCount: number;
  totalEntityCount: number;
  completedEntityCount: number;
  report: unknown;
  error: string | null;
  stagingCleanupError: string | null;
  cleanedAt: string | null;
  finalizedAt: string | null;
}

/** Converts one timestamp-like value into an ISO string when present. */
const toIsoString = (value: Date | string | null | undefined) => {
  if (value == null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

/** Lists source_versions rows ordered by descending source tag. */
export const listLocalHsdataSourceVersions = async () => {
  const db = getLocalDb();
  const rows = await db.select({
    sourceTag:        SourceVersion.sourceTag,
    build:            SourceVersion.build,
    sourceCommit:     SourceVersion.sourceCommit,
    sourceUri:        SourceVersion.sourceUri,
    importStatus:     SourceVersion.status,
    importedAt:       SourceVersion.importedAt,
    projectionStatus: SourceVersion.projectionStatus,
    projectedAt:      SourceVersion.projectedAt,
    projectionError:  SourceVersion.projectionError,
  })
    .from(SourceVersion)
    .orderBy(desc(SourceVersion.sourceTag));

  return rows.map(row => ({
    sourceTag:        row.sourceTag,
    build:            row.build,
    sourceCommit:     row.sourceCommit,
    sourceUri:        row.sourceUri,
    importStatus:     row.importStatus,
    importedAt:       toIsoString(row.importedAt),
    projectionStatus: row.projectionStatus,
    projectedAt:      toIsoString(row.projectedAt),
    projectionError:  row.projectionError,
  } satisfies HsdataSourceVersionStatus));
};

/** Loads the current hsdata local overview from source_versions and raw tables. */
export const getLocalHsdataOverview = async () => {
  const db = getLocalDb();

  const [
    sourceVersionSummary,
    latestCompletedSourceVersion,
    rawSnapshotSummary,
    rawSnapshotTagSummary,
  ] = await Promise.all([
    db.select({
      rows:       sql<number>`count(*)`,
      completed:  sql<number>`coalesce(sum(case when ${SourceVersion.status} = 'completed' then 1 else 0 end), 0)`,
      failed:     sql<number>`coalesce(sum(case when ${SourceVersion.status} = 'failed' then 1 else 0 end), 0)`,
      processing: sql<number>`coalesce(sum(case when ${SourceVersion.status} = 'processing' then 1 else 0 end), 0)`,
      pending:    sql<number>`coalesce(sum(case when ${SourceVersion.status} = 'pending' then 1 else 0 end), 0)`,
      latestImportedAt: sql<Date | string | null>`max(${SourceVersion.importedAt})`,
    }).from(SourceVersion).then(rows => rows[0]),
    db.select({
      sourceTag: SourceVersion.sourceTag,
    })
      .from(SourceVersion)
      .where(eq(SourceVersion.status, 'completed'))
      .orderBy(desc(SourceVersion.sourceTag))
      .limit(1)
      .then(rows => rows[0] ?? null),
    db.select({
      rows:              sql<number>`count(*)`,
      projectedRows:     sql<number>`coalesce(sum(case when ${RawEntitySnapshot.projected} then 1 else 0 end), 0)`,
      unprojectedRows:   sql<number>`coalesce(sum(case when not ${RawEntitySnapshot.projected} then 1 else 0 end), 0)`,
      distinctCardCount: sql<number>`count(distinct ${RawEntitySnapshot.cardId})`,
      updatedAt:         sql<Date | string | null>`max(${RawEntitySnapshot.updatedAt})`,
    }).from(RawEntitySnapshot).then(rows => rows[0]),
    db.select({
      rows:                  sql<number>`count(*)`,
      distinctSnapshotCount: sql<number>`count(distinct ${RawEntitySnapshotTag.snapshotId})`,
      distinctEnumCount:     sql<number>`count(distinct ${RawEntitySnapshotTag.enumId})`,
    }).from(RawEntitySnapshotTag).then(rows => rows[0]),
  ]);

  return {
    summary: {
      sourceVersionCount:          sourceVersionSummary?.rows ?? 0,
      completedSourceVersionCount: sourceVersionSummary?.completed ?? 0,
      failedSourceVersionCount:    sourceVersionSummary?.failed ?? 0,
      snapshotCount:               rawSnapshotSummary?.rows ?? 0,
      tagRowCount:                 rawSnapshotTagSummary?.rows ?? 0,
    },
    tables: {
      sourceVersions: {
        name:                      'source_versions',
        kind:                      'table',
        rows:                      sourceVersionSummary?.rows ?? 0,
        latestImportedAt:          toIsoString(sourceVersionSummary?.latestImportedAt ?? null) ?? undefined,
        latestCompletedSourceTag:  latestCompletedSourceVersion?.sourceTag ?? undefined,
        statusCounts: {
          completed:  sourceVersionSummary?.completed ?? 0,
          failed:     sourceVersionSummary?.failed ?? 0,
          processing: sourceVersionSummary?.processing ?? 0,
          pending:    sourceVersionSummary?.pending ?? 0,
        },
      },
      rawEntitySnapshots: {
        name:              'raw_entity_snapshots',
        kind:              'table',
        rows:              rawSnapshotSummary?.rows ?? 0,
        projectedRows:     rawSnapshotSummary?.projectedRows ?? 0,
        unprojectedRows:   rawSnapshotSummary?.unprojectedRows ?? 0,
        distinctCardCount: rawSnapshotSummary?.distinctCardCount ?? 0,
        updatedAt:         toIsoString(rawSnapshotSummary?.updatedAt ?? null) ?? undefined,
      },
      rawEntitySnapshotTags: {
        name:                  'raw_entity_snapshot_tags',
        kind:                  'table',
        rows:                  rawSnapshotTagSummary?.rows ?? 0,
        distinctSnapshotCount: rawSnapshotTagSummary?.distinctSnapshotCount ?? 0,
        distinctEnumCount:     rawSnapshotTagSummary?.distinctEnumCount ?? 0,
      },
      tagValueView: {
        name:                  'tag_value_view',
        kind:                  'view',
        rows:                  rawSnapshotTagSummary?.rows ?? 0,
        distinctSnapshotCount: rawSnapshotTagSummary?.distinctSnapshotCount ?? 0,
        distinctEnumCount:     rawSnapshotTagSummary?.distinctEnumCount ?? 0,
      },
    },
  } satisfies HsdataOverview;
};

/** Reads one persisted hsdata import job row from the local database when it exists. */
export const getLocalHsdataImportJob = async (jobId: string) => {
  const db = getLocalDb();
  const row = await db.select({
    jobId:                HsdataImportJob.id,
    sourceTag:            HsdataImportJob.sourceTag,
    build:                HsdataImportJob.build,
    sourceHash:           HsdataImportJob.sourceHash,
    dryRun:               HsdataImportJob.dryRun,
    force:                HsdataImportJob.force,
    status:               HsdataImportJob.status,
    stagingCleanupStatus: HsdataImportJob.stagingCleanupStatus,
    totalBatchCount:      HsdataImportJob.totalChunkCount,
    totalEntityCount:     HsdataImportJob.totalEntityCount,
    report:               HsdataImportJob.report,
    error:                HsdataImportJob.error,
    stagingCleanupError:  HsdataImportJob.stagingCleanupError,
    cleanedAt:            HsdataImportJob.cleanedAt,
    finalizedAt:          HsdataImportJob.finalizedAt,
  })
    .from(HsdataImportJob)
    .where(eq(HsdataImportJob.id, jobId))
    .then(rows => rows[0] ?? null);

  if (!row) {
    return null;
  }

  return {
    jobId:                row.jobId,
    sourceTag:            row.sourceTag,
    build:                row.build,
    sourceHash:           row.sourceHash,
    dryRun:               row.dryRun,
    force:                row.force,
    status:               row.status,
    stagingCleanupStatus: row.stagingCleanupStatus,
    totalBatchCount:      row.totalBatchCount,
    completedBatchCount:  0,
    failedBatchCount:     row.status === 'failed' ? 1 : 0,
    processingBatchCount: row.status === 'uploading' ? 1 : 0,
    totalEntityCount:     row.totalEntityCount,
    completedEntityCount: 0,
    report:               row.report,
    error:                row.error,
    stagingCleanupError:  row.stagingCleanupError,
    cleanedAt:            toIsoString(row.cleanedAt),
    finalizedAt:          toIsoString(row.finalizedAt),
  } satisfies HsdataImportJobSnapshot;
};
