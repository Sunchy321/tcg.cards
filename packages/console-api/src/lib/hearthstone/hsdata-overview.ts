import { desc, sql } from 'drizzle-orm';

import { db } from '@tcg-cards/db/db';
import {
  RawEntitySnapshot,
  RawEntitySnapshotTag,
  SourceVersion,
  TagValueView,
} from '@tcg-cards/db/schema/local/hearthstone/card-model';

export interface HsdataOverviewSummary {
  sourceVersionCount:          number;
  completedSourceVersionCount: number;
  failedSourceVersionCount:    number;
  snapshotCount:               number;
  latestSnapshotCount:         number;
  tagRowCount:                 number;
}

export interface HsdataStatusCounts {
  completed:  number;
  failed:     number;
  processing: number;
  pending:    number;
}

export interface HsdataSourceVersionOverview {
  name:                      'source_versions';
  kind:                      'table';
  rows:                      number;
  latestImportedAt?:         string;
  latestCompletedSourceTag?: number;
  statusCounts:              HsdataStatusCounts;
}

export interface HsdataRawEntitySnapshotOverview {
  name:              'raw_entity_snapshots';
  kind:              'table';
  rows:              number;
  latestRows:        number;
  distinctCardCount: number;
  updatedAt?:        string;
}

export interface HsdataRawEntitySnapshotTagOverview {
  name:                  'raw_entity_snapshot_tags';
  kind:                  'table';
  rows:                  number;
  distinctSnapshotCount: number;
  distinctEnumCount:     number;
}

export interface HsdataTagValueViewOverview {
  name:                  'tag_value_view';
  kind:                  'view';
  rows:                  number;
  distinctSnapshotCount: number;
  distinctEnumCount:     number;
}

export interface HsdataOverview {
  summary: HsdataOverviewSummary;
  tables:  {
    sourceVersions:        HsdataSourceVersionOverview;
    rawEntitySnapshots:    HsdataRawEntitySnapshotOverview;
    rawEntitySnapshotTags: HsdataRawEntitySnapshotTagOverview;
    tagValueView:          HsdataTagValueViewOverview;
  };
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

export async function getHsdataOverview(): Promise<HsdataOverview> {
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
}
