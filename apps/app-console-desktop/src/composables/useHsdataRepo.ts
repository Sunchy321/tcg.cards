import { consumeEventIterator } from '@orpc/client';
import type { PublishReport, SingleCardPublishReport } from 'service-desktop-runtime/lib/hearthstone/hsdata-publish';
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
export type HsdataImportPhase =
  | 'reading_source'
  | 'parsing_entities'
  | 'writing_batches'
  | 'finalizing_source_tag'
  | 'completed'
  | 'failed';

/** Desktop hsdata import progress event payload. */
export interface HsdataImportProgressEvent {
  sourceId:            string;
  sourceTag:           number | null;
  jobId:               string | null;
  phase:               HsdataImportPhase | string;
  message:             string;
  startedAt:           string;
  phaseStartedAt:      string;
  finishedAt:          string | null;
  totalBatchCount:     number | null;
  completedBatchCount: number | null;
  totalEntityCount:    number | null;
  completedEntityCount: number | null;
  currentBatchIndex:   number | null;
  totalWorkCount:      number | null;
  completedWorkCount:  number | null;
  workLabel:           string | null;
}

/** Desktop hsdata projection phases emitted by the local projection workflow. */
export type HsdataProjectPhase =
  | 'loading_snapshots'
  | 'loading_tags'
  | 'projecting_snapshots'
  | 'summarizing_changes'
  | 'writing_rows'
  | 'completed'
  | 'failed';

/** One writing segment mirrored into the frontend stacked progress bar. */
export interface HsdataProjectWriteSegment {
  totalRowCount: number;
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
  sourceTag:               number;
  phase:                   HsdataProjectPhase | string;
  message:                 string;
  startedAt:               string;
  phaseStartedAt:          string;
  finishedAt:              string | null;
  totalSnapshotCount:      number | null;
  completedSnapshotCount:  number | null;
  totalWorkCount:          number | null;
  completedWorkCount:      number | null;
  workLabel:               string | null;
  writeBreakdown:          HsdataProjectWriteBreakdown | null;
  reconciledCounts:        HsdataProjectReconciledCounts | null;
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
  entityPlan:            { upsert: number; delete: number };
  localizationPlan:      { upsert: number; delete: number };
  relationPlan:          { upsert: number; delete: number };
  entityDiff:            HsdataDiffBreakdown;
  localizationDiff:      HsdataDiffBreakdown;
  relationDiff:          HsdataDiffBreakdown;
  sampleDiffPath:        string | null;
}

export interface HsdataDiffBreakdown {
  versionMatch:           number;
  versionChanged:         number;
  isLatestChanged:        number;
  orphanVersionChanged:   number;
  renderHashChanged?:     number;
  renderHashNullExisting?: number;
}

/** Recompute-latest progress event streamed from the local runtime. */
export interface HsdataRecomputeLatestProgressEvent {
  phase: string;
  message: string;
  startedAt: string;
  phaseStartedAt: string;
  finishedAt: string | null;
  totalRowCount: number | null;
  completedRowCount: number | null;
  updatedCount: number | null;
}

/** Recompute-latest report returned after recalculating isLatest flags. */
export interface HsdataRecomputeLatestReport {
  entityRowCount: number;
  localizationRowCount: number;
  relationRowCount: number;
  entityUpdatedCount: number;
  localizationUpdatedCount: number;
  relationUpdatedCount: number;
}

/** Publish report type from the server zod schema. */
export type HsdataPublishReport = PublishReport;

/** Single-card publish report type from the server zod schema. */
export type HsdataSingleCardPublishReport = SingleCardPublishReport;

/** Publish progress event streamed from the desktop runtime. */
export interface PublishJobProgressEvent {
  batchId: string;
  publishType: string;
  publishTarget: string;
  phase: string;
  message: string;
  startedAt: string;
  phaseStartedAt: string;
  finishedAt: string | null;
  totalRowCount: number | null;
  completedRowCount: number | null;
  report: HsdataPublishReport | null;
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

const trackedImportSourceIds = new Set<string>();
const trackedProjectSourceTags = new Set<number>();
const importTrackingListeners = new Set<() => void>();
const projectTrackingListeners = new Set<() => void>();

/** Detects the final progress phases that can close one task subscription. */
function isTerminalProgressPhase(phase: string): boolean {
  return phase === 'completed' || phase === 'failed';
}

/** Starts tracking one import source so progress listeners can subscribe to its event stream. */
export function trackHsdataImportSourceProgress(sourceId: string) {
  if (sourceId.length === 0) {
    return;
  }

  trackedImportSourceIds.add(sourceId);
  notifyImportTrackingChanged();
}

/** Starts tracking one projection source tag so progress listeners can subscribe to its event stream. */
export function trackHsdataProjectSourceProgress(sourceTag: number) {
  trackedProjectSourceTags.add(sourceTag);
  notifyProjectTrackingChanged();
}

/** Notifies active import listeners that the tracked source set changed. */
function notifyImportTrackingChanged() {
  for (const listener of importTrackingListeners) {
    listener();
  }
}

/** Notifies active projection listeners that the tracked source set changed. */
function notifyProjectTrackingChanged() {
  for (const listener of projectTrackingListeners) {
    listener();
  }
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

export async function readHsdataSource(id: string) {
  return await useDesktopRuntimeClient().hsdata.readSource({ id }) as HsdataResolvedSource;
}

export async function importHsdataSource(id: string, dryRun: boolean, force: boolean) {
  trackHsdataImportSourceProgress(id);

  return await useDesktopRuntimeClient().hsdata.importSource({
    id,
    dryRun,
    force,
  }) as HsdataImportReport;
}

/** Options for a single projection run. */
export interface HsdataProjectOptions {
  dryRun?:           boolean;
  force?:            boolean;
  skipLatestUpdate?: boolean;
  sampleDiff?:       boolean;
}

/** Local Bun runtime projection command executed against the configured desktop database. */
export function projectLocalHsdataSourceVersion(
  sourceTag: number,
  options: HsdataProjectOptions,
) {
  return (async () => {
    trackHsdataProjectSourceProgress(sourceTag);

    return await useDesktopRuntimeClient().hsdata.projectSourceVersion({
      sourceTag,
      ...options,
    }) as HsdataProjectReport;
  })();
}

/** Recomputes isLatest flags across the current local projection tables. */
export function recomputeLatestHsdataProjection() {
  return (async () => {
    return await useDesktopRuntimeClient().hsdata.recomputeLatest() as HsdataRecomputeLatestReport;
  })();
}

/** Current local latest projection published to the configured remote target. */
export function publishCurrentHsdataToRemote(dryRun: boolean) {
  return (async () => {
    return await useDesktopRuntimeClient().hsdata.publishCurrentToRemote({ dryRun });
  })();
}

/** Lists recent publish batches for the current target. */
export function listPublishBatches() {
  return (async () => {
    return await useDesktopRuntimeClient().hsdata.listPublishBatches();
  })();
}

/** Checks for an incomplete publish batch that can be resumed. */
export function getIncompletePublishBatch() {
  return (async () => {
    return await useDesktopRuntimeClient().hsdata.getIncompletePublishBatch();
  })();
}

/** Publishes a single card to the remote target (dev tool). */
export function publishSingleCard(cardId: string) {
  return (async () => {
    return await useDesktopRuntimeClient().hsdata.publishSingleCard({ cardId });
  })();
}

/** Streams publish job progress snapshots from the local Bun runtime. */
export function listenHsdataPublishProgress(
  handler: (event: PublishJobProgressEvent) => void,
): () => void {
  return consumeEventIterator(
    useDesktopRuntimeClient().hsdata.watchPublishJob(),
    { onEvent: handler },
  );
}

/** Streams recompute-latest progress events from the local Bun runtime. */
export function listenHsdataRecomputeLatestProgress(
  handler: (event: HsdataRecomputeLatestProgressEvent) => void,
): () => void {
  return consumeEventIterator(
    useDesktopRuntimeClient().hsdata.watchRecomputeLatest(),
    { onEvent: handler },
  );
}

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

/** Streams hsdata import progress snapshots from the local Bun runtime. */
export function listenHsdataImportProgress(
  handler: (event: HsdataImportProgressEvent) => void,
) {
  const runtimeClient = useDesktopRuntimeClient();
  let stopped = false;
  const unsubscribers = new Map<string, () => Promise<void>>();

  /** Closes one active import subscription if it exists. */
  async function closeImportSubscription(sourceId: string): Promise<void> {
    const unsubscribe = unsubscribers.get(sourceId);
    if (!unsubscribe) {
      return;
    }

    unsubscribers.delete(sourceId);

    try {
      await unsubscribe();
    } catch {
      // Ignore cancellation errors while the page is shutting down or switching jobs.
    }
  }

  /** Opens streaming subscriptions for every currently tracked import source. */
  function ensureImportSubscriptions() {
    if (stopped) {
      return;
    }

    for (const sourceId of trackedImportSourceIds) {
      if (unsubscribers.has(sourceId)) {
        continue;
      }

      const unsubscribe = consumeEventIterator(
        runtimeClient.hsdata.watchImportJob({ sourceId }),
        {
          onEvent(event) {
            handler(event);

            if (!isTerminalProgressPhase(event.phase)) {
              return;
            }

            trackedImportSourceIds.delete(sourceId);
            notifyImportTrackingChanged();
            void closeImportSubscription(sourceId);
          },
          onError() {
            trackedImportSourceIds.delete(sourceId);
            notifyImportTrackingChanged();
          },
          onFinish() {
            unsubscribers.delete(sourceId);
          },
        },
      );

      unsubscribers.set(sourceId, unsubscribe);
    }
  }

  importTrackingListeners.add(ensureImportSubscriptions);
  ensureImportSubscriptions();

  return Promise.resolve(() => {
    stopped = true;
    importTrackingListeners.delete(ensureImportSubscriptions);

    void Promise.all([...unsubscribers.keys()].map(async sourceId => {
      await closeImportSubscription(sourceId);
    }));
  });
}

/** Streams hsdata projection progress snapshots for the desktop window. */
export function listenHsdataProjectProgress(
  handler: (event: HsdataProjectProgressEvent) => void,
) {
  const runtimeClient = useDesktopRuntimeClient();
  let stopped = false;
  const unsubscribers = new Map<number, () => Promise<void>>();

  /** Closes one active projection subscription if it exists. */
  async function closeProjectSubscription(sourceTag: number): Promise<void> {
    const unsubscribe = unsubscribers.get(sourceTag);
    if (!unsubscribe) {
      return;
    }

    unsubscribers.delete(sourceTag);

    try {
      await unsubscribe();
    } catch {
      // Ignore cancellation errors while the page is shutting down or switching jobs.
    }
  }

  /** Opens streaming subscriptions for every currently tracked projection source tag. */
  function ensureProjectSubscriptions() {
    if (stopped) {
      return;
    }

    for (const sourceTag of trackedProjectSourceTags) {
      if (unsubscribers.has(sourceTag)) {
        console.log('[hsdata] subscription already exists for', sourceTag, '- skipping');
        continue;
      }

      console.log('[hsdata] creating subscription for', sourceTag);
      const unsubscribe = consumeEventIterator(
        runtimeClient.hsdata.watchProjectJob({ sourceTag }),
        {
          onEvent(event) {
            handler(event);

            if (!isTerminalProgressPhase(event.phase)) {
              return;
            }

            console.log('[hsdata] terminal event for', sourceTag, 'phase:', event.phase);
            // Remove from tracking maps synchronously so the next projection
            // for the same sourceTag can immediately re-subscribe.
            trackedProjectSourceTags.delete(sourceTag);
            const cleanup = unsubscribers.get(sourceTag);
            unsubscribers.delete(sourceTag);
            notifyProjectTrackingChanged();

            // Close the underlying SSE connection asynchronously.
            if (cleanup) {
              cleanup().catch(() => {});
            }
          },
          onError() {
            trackedProjectSourceTags.delete(sourceTag);
            unsubscribers.delete(sourceTag);
            notifyProjectTrackingChanged();
          },
          onFinish() {
            unsubscribers.delete(sourceTag);
          },
        },
      );

      unsubscribers.set(sourceTag, unsubscribe);
    }
  }

  projectTrackingListeners.add(ensureProjectSubscriptions);
  ensureProjectSubscriptions();

  return Promise.resolve(() => {
    stopped = true;
    projectTrackingListeners.delete(ensureProjectSubscriptions);

    void Promise.all([...unsubscribers.keys()].map(async sourceTag => {
      await closeProjectSubscription(sourceTag);
    }));
  });
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
  return getConsoleErrorMessage(error, '操作失败');
}
