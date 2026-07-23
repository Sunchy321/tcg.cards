import { consumeEventIterator } from '@orpc/client';
import type { PublishReport, SingleCardPublishReport } from 'service-desktop-runtime/lib/hearthstone/hsdata-publish';
import type { ProgressSegment } from '@tcg-cards/model/src/task';
import { getConsoleErrorMessage } from '@tcg-cards/console-core';

import { useDesktopRuntimeClient } from './useDesktopRuntimeClient';
import { getDesktopGameRepo, setDesktopGameRepo } from './useDesktopSettings';

export interface HsdataRepoState {
  repoPath?: string;
}

export interface HsdataSyncResult {
  repoPath: string;
  remote:   string;
}

/** Supported hsdata source kinds returned by the desktop source list. */
export type HsdataSourceKind = 'tag' | 'worktree';

/** One hsdata source entry listed from the local git repository. */
export interface HsdataFile {
  id:           string;
  name:         string;
  kind:         HsdataSourceKind;
  size:         number;
  time?:        string;
  sourceTag?:   number;
  sourceCommit: string;
  shortCommit:  string;
  sourceUri:    string;
}

export interface HsdataResolvedSource extends HsdataFile {
  xml:       string;
  sourceTag: number;
}

export interface HsdataImportReport {
  dryRun:                boolean;
  skipped:               boolean;
  sourceTag:             number;
  build:                 number;
  sourceHash:            string;
  entityCount:           number;
  insertedSnapshots:     number;
  reusedSnapshots:       number;
  insertedTagRows:       number;
  discoveredTagCount:    number;
  updatedDiscoveredTags: number;
  fallbackTagRowCount:   number;
  discoveredTags:        number[];
}

/** Import status values returned from the local `source_versions` table. */
export type HsdataSourceImportStatus = 'pending' | 'processing' | 'completed' | 'failed';

/** Projection status values returned from the local `source_versions` table. */
export type HsdataSourceProjectionStatus = 'not_started' | 'processing' | 'completed' | 'failed';

/** One local source version row returned by the desktop database commands. */
export interface HsdataSourceVersionStatus {
  sourceTag:        number;
  build:            number | null;
  sourceCommit:     string;
  sourceUri:        string;
  importStatus:     HsdataSourceImportStatus;
  importedAt:       string | null;
  projectionStatus: HsdataSourceProjectionStatus;
  projectedAt:      string | null;
  projectionError:  string | null;
  unpackStatus:     string;
  unpackedAt:       string | null;
}

/** Status counters grouped by import state for the local overview. */
export interface HsdataStatusCounts {
  completed:  number;
  failed:     number;
  processing: number;
  pending:    number;
}

/** `source_versions` overview returned from the local desktop database. */
export interface HsdataSourceVersionOverview {
  name:                      'source_versions';
  kind:                      'table';
  rows:                      number;
  latestImportedAt?:         string;
  latestCompletedSourceTag?: number;
  statusCounts:              HsdataStatusCounts;
}

/** `raw_entity_snapshots` overview returned from the local desktop database. */
export interface HsdataRawEntitySnapshotOverview {
  name:              'raw_entity_snapshots';
  kind:              'table';
  rows:              number;
  projectedRows:     number;
  unprojectedRows:   number;
  distinctCardCount: number;
  updatedAt?:        string;
}

/** `raw_entity_snapshot_tags` overview returned from the local desktop database. */
export interface HsdataRawEntitySnapshotTagOverview {
  name:                  'raw_entity_snapshot_tags';
  kind:                  'table';
  rows:                  number;
  distinctSnapshotCount: number;
  distinctEnumCount:     number;
}

/** `tag_value_view` overview returned from the local desktop database. */
export interface HsdataTagValueViewOverview {
  name:                  'tag_value_view';
  kind:                  'view';
  rows:                  number;
  distinctSnapshotCount: number;
  distinctEnumCount:     number;
}

/** Aggregate hsdata overview returned from the local desktop database. */
export interface HsdataOverview {
  summary: {
    sourceVersionCount:          number;
    completedSourceVersionCount: number;
    failedSourceVersionCount:    number;
    snapshotCount:               number;
    tagRowCount:                 number;
  };
  tables: {
    sourceVersions:        HsdataSourceVersionOverview;
    rawEntitySnapshots:    HsdataRawEntitySnapshotOverview;
    rawEntitySnapshotTags: HsdataRawEntitySnapshotTagOverview;
    tagValueView:          HsdataTagValueViewOverview;
  };
}

/** Desktop hsdata import phases emitted by the local import workflow. */
export type HsdataImportPhase
  = | 'reading_source'
    | 'parsing_entities'
    | 'writing_batches'
    | 'finalizing_source_tag'
    | 'completed'
    | 'failed';

/** Desktop hsdata import progress event payload. */
export interface HsdataImportProgressEvent {
  sourceId:             string;
  sourceTag:            number | null;
  jobId:                string | null;
  phase:                HsdataImportPhase | string;
  message:              string;
  startedAt:            string;
  phaseStartedAt:       string;
  finishedAt:           string | null;
  totalBatchCount:      number | null;
  completedBatchCount:  number | null;
  totalEntityCount:     number | null;
  completedEntityCount: number | null;
  currentBatchIndex:    number | null;
  totalWorkCount:       number | null;
  completedWorkCount:   number | null;
  workLabel:            string | null;
}

/** Desktop hsdata projection phases emitted by the local projection workflow. */
export type HsdataProjectPhase
  = | 'loading_snapshots'
    | 'loading_tags'
    | 'projecting_snapshots'
    | 'summarizing_changes'
    | 'writing_rows'
    | 'recomputing_latest'
    | 'completed'
    | 'failed';

/** One writing segment mirrored into the frontend stacked progress bar. */
export interface HsdataProjectWriteSegment {
  totalRowCount:     number;
  completedRowCount: number;
}

/** Writing breakdown mirrored into the frontend stacked progress bar. */
export interface HsdataProjectWriteBreakdown {
  entity:             HsdataProjectWriteSegment;
  localization:       HsdataProjectWriteSegment;
  latest:             HsdataProjectWriteSegment;
  relation:           HsdataProjectWriteSegment;
  card:               HsdataProjectWriteSegment;
  entityDelete:       HsdataProjectWriteSegment;
  localizationDelete: HsdataProjectWriteSegment;
  relationDelete:     HsdataProjectWriteSegment;
}

/** Projection reconciled counts surfaced from the summarization phase. */
export interface HsdataProjectReconciledCounts {
  reusedEntities:        number;
  reusedLocalizations:   number;
  reusedRelations:       number;
  insertedEntities:      number;
  insertedLocalizations: number;
  insertedRelations:     number;
  updatedEntities:       number;
  updatedLocalizations:  number;
  updatedRelations:      number;
}

/** Desktop hsdata projection progress event payload. */
export interface HsdataProjectProgressEvent {
  sourceTag:              number;
  phase:                  HsdataProjectPhase | string;
  message:                string;
  startedAt:              string;
  phaseStartedAt:         string;
  finishedAt:             string | null;
  totalSnapshotCount:     number | null;
  completedSnapshotCount: number | null;
  totalWorkCount:         number | null;
  completedWorkCount:     number | null;
  workLabel:              string | null;
  writeBreakdown:         HsdataProjectWriteBreakdown | null;
  reconciledCounts:       HsdataProjectReconciledCounts | null;
}

export interface HsdataProjectReport {
  dryRun:                boolean;
  skipped:               boolean;
  sourceTag:             number;
  build:                 number;
  snapshotCount:         number;
  totalSnapshotCount:    number;
  skippedSnapshotCount:  number;
  insertedEntities:      number;
  reusedEntities:        number;
  updatedEntities:       number;
  insertedLocalizations: number;
  reusedLocalizations:   number;
  updatedLocalizations:  number;
  insertedRelations:     number;
  reusedRelations:       number;
  updatedRelations:      number;
  cardRowCount:          number;
  unprojectedTagCount:   number;
  unprojectedTags:       HsdataUnprojectedTagReportRow[];
  entityPlan:            { upsert: number, delete: number };
  localizationPlan:      { upsert: number, delete: number };
  relationPlan:          { upsert: number, delete: number };
  entityDiff:            HsdataDiffBreakdown;
  localizationDiff:      HsdataDiffBreakdown;
  relationDiff:          HsdataDiffBreakdown;
  sampleDiffPath:        string | null;
}

export interface HsdataDiffBreakdown {
  versionMatch:            number;
  versionChanged:          number;
  orphanVersionChanged:    number;
  renderHashChanged?:      number;
  renderHashNullExisting?: number;
}

/** Publish report type from the server zod schema. */
export type HsdataPublishReport = PublishReport;

/** Single-card publish report type from the server zod schema. */
export type HsdataSingleCardPublishReport = SingleCardPublishReport;

/** Publish progress event streamed from the desktop runtime. */
interface RawPublishJobProgressEvent {
  batchId?:           string;
  publishType?:       string;
  publishTarget?:     string;
  phase:              string;
  message:            string;
  startedAt?:         string;
  phaseStartedAt?:    string;
  finishedAt?:        string | null;
  total?:             number | null;
  completed?:         number | null;
  totalRowCount?:     number | null;
  completedRowCount?: number | null;
  report?:            HsdataPublishReport | null;
}

export interface HsdataUnprojectedTagReportRow {
  enumId: number;
  slug:   string;
  count:  number;
}

export interface ReportMetric {
  key:   string;
  label: string;
  value: string | number | boolean;
}

/** Detects the final progress phases that can close one task subscription. */
function isTerminalProgressPhase(phase: string): boolean {
  return phase === 'completed' || phase === 'failed';
}

export function getHsdataRepoPath() {
  return getDesktopGameRepo('hearthstone', 'hsdata');
}

export function setHsdataRepoPath(repoPath: string | null) {
  return setDesktopGameRepo('hearthstone', 'hsdata', repoPath);
}

export async function getHsdataRepoState() {
  return await useDesktopRuntimeClient().hsdata.getRepoState() as HsdataRepoState;
}

export async function syncHsdataRemoteVersions() {
  return await useDesktopRuntimeClient().hsdata.syncRemoteVersions() as HsdataSyncResult;
}

export async function listHsdataSources() {
  return await useDesktopRuntimeClient().hsdata.listSources() as HsdataFile[];
}

export async function syncPatches() {
  return await useDesktopRuntimeClient().hsdata.syncPatches() as { count: number };
}

export async function readHsdataSource(id: string) {
  return await useDesktopRuntimeClient().hsdata.readSource({ id }) as HsdataResolvedSource;
}

/** Options for a single projection run. */
export interface HsdataProjectOptions {
  dryRun?:     boolean;
  force?:      boolean;
  sampleDiff?: boolean;
}

/** Explicit publish stream selector used by the Hearthstone publish page. */
export interface HsdataPublishStreamInput {
  publishTarget: 'hearthstone';
  environment:   string;
}

/** Publish job control result returned after a cooperative pause or stop request. */
/** Current local latest projection published to the configured remote target. */
/** Current local latest projection pinned into the local publish baseline. */
/** Deletes one publish history record. */
export function deletePublishHistory(taskRunId: string) {
  return (async () => {
    return await useDesktopRuntimeClient().hsdata.deletePublishHistory({ taskRunId });
  })();
}

/** Lists publish history from completed task runs. */
export function listPublishHistory(input: HsdataPublishStreamInput) {
  return (async () => {
    return await useDesktopRuntimeClient().hsdata.listPublishHistory(input);
  })();
}

/** Lists recent publish batches for the current target. */
export function listPublishBatches(input: HsdataPublishStreamInput) {
  return (async () => {
    return await useDesktopRuntimeClient().hsdata.listPublishBatches(input);
  })();
}

/** Checks for an incomplete publish batch that can be resumed. */
export function getIncompletePublishBatch(input: HsdataPublishStreamInput) {
  return (async () => {
    return await useDesktopRuntimeClient().hsdata.getIncompletePublishBatch(input);
  })();
}

/** Cancels one incomplete publish batch that remains only as local database state. */
export function cancelIncompleteHsdataPublishBatch(
  input: HsdataPublishStreamInput & { batchId: string },
) {
  return (async () => {
    return await useDesktopRuntimeClient().hsdata.cancelIncompletePublishBatch(input) as HsdataPublishReport;
  })();
}

/** Publishes a single card to the remote target (dev tool). */
export function publishSingleCard(
  cardId: string,
  input: HsdataPublishStreamInput,
) {
  return (async () => {
    return await useDesktopRuntimeClient().hsdata.publishSingleCard({
      cardId,
      ...input,
    });
  })();
}

/** Registers one remote publish stream so the gate check does not reject it. */
export function registerRemotePublishStream(input: {
  connectionString:  string;
  publishTarget:     string;
  environment:       string;
  targetFingerprint: string;
}) {
  return (async () => {
    return await useDesktopRuntimeClient().hsdata.registerPublishStream(input);
  })();
}

/** Requests a cooperative stop of the current publish or pin job. */
/** Local hsdata source version rows loaded from the configured desktop database. */
export function listLocalHsdataSourceVersions() {
  return (async () => {
    return await useDesktopRuntimeClient().hsdata.listLocalSourceVersions() as HsdataSourceVersionStatus[];
  })();
}

/** Local hsdata overview loaded from the configured desktop database. */
export function getLocalHsdataOverview() {
  return (async () => {
    return await useDesktopRuntimeClient().hsdata.getLocalOverview() as HsdataOverview;
  })();
}

/** Batch resets import status for selected sourceTags. */
export function resetHsdataImportStatus(sourceTags: number[]) {
  return (async () => {
    return await useDesktopRuntimeClient().hsdata.resetImportStatus({ sourceTags }) as { resetCount: number };
  })();
}

/** Batch resets projection status for selected sourceTags. */
export function resetHsdataProjectionStatus(sourceTags: number[]) {
  return (async () => {
    return await useDesktopRuntimeClient().hsdata.resetProjectionStatus({ sourceTags }) as { resetCount: number };
  })();
}

export function formatHsdataDate(dateStr: string | undefined) {
  if (!dateStr) {
    return '-';
  }

  try {
    return new Date(dateStr).toLocaleString('zh-CN');
  } catch {
    return dateStr;
  }
}

export function formatHsdataBytes(value: number) {
  if (!Number.isFinite(value)) {
    return '-';
  }

  if (value < 1024) {
    return `${value} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = -1;

  do {
    size /= 1024;
    unitIndex += 1;
  } while (size >= 1024 && unitIndex < units.length - 1);

  const digits = size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

export function getHsdataErrorMessage(error: unknown) {
  const message = getConsoleErrorMessage(error, '操作失败');

  if (message.includes('is already leased by another publish batch')) {
    return '当前 publish stream 正在被另一批发布占用，请稍后重试。';
  }

  if (message.includes('lease could not be renewed')) {
    return '当前发布在执行过程中失去了 publish stream lease，已被中止。';
  }

  return message;
}
