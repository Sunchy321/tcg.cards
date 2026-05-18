import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getConsoleErrorMessage } from '@tcg-cards/console-core';

import { getDesktopGameRepo, setDesktopGameRepo } from './useDesktopSettings';

export interface HsdataRepoState {
  repoPath?: string;
}

export interface HsdataSyncResult {
  repoPath: string;
  remote:   string;
}

/** Supported hsdata source kinds returned by the desktop source list. */
export type HsdataSourceKind = 'tag';

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
  latestSnapshotCount:   number;
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
  latestRows:        number;
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
    latestSnapshotCount:         number;
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
  totalBatchCount:     number | null;
  completedBatchCount: number | null;
  totalEntityCount:    number | null;
  completedEntityCount: number | null;
  currentBatchIndex:   number | null;
}

export interface HsdataProjectReport {
  dryRun:                boolean;
  skipped:               boolean;
  sourceTag:             number;
  build:                 number;
  snapshotCount:         number;
  insertedEntities:      number;
  reusedEntities:        number;
  updatedEntities:       number;
  insertedLocalizations: number;
  reusedLocalizations:   number;
  updatedLocalizations:  number;
  insertedRelations:     number;
  updatedRelations:      number;
  unprojectedTagCount:   number;
  unprojectedTags:       HsdataUnprojectedTagReportRow[];
}

/** Remote publish report returned after applying the current local projection. */
export interface HsdataPublishReport {
  batchId:              string;
  publishTargetId:      string;
  environment:          string;
  targetFingerprint:    string;
  manifestHash:         string;
  previousManifestHash: string | null;
  sourceTagMin:         number;
  sourceTagMax:         number;
  buildMin:             number;
  buildMax:             number;
  cardCount:            number;
  changedCardCount:     number;
  insertedCardCount:    number;
  updatedCardCount:     number;
  deletedCardCount:     number;
  unchangedCardCount:   number;
  publishedAt:          string;
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

export function getHsdataRepoPath() {
  return getDesktopGameRepo('hearthstone', 'hsdata');
}

export function setHsdataRepoPath(repoPath: string | null) {
  return setDesktopGameRepo('hearthstone', 'hsdata', repoPath);
}

export function getHsdataRepoState() {
  return invoke<HsdataRepoState>('hsdata_get_repo_state');
}

export function syncHsdataRemoteVersions() {
  return invoke<HsdataSyncResult>('hsdata_sync_remote_versions');
}

export function listHsdataSources() {
  return invoke<HsdataFile[]>('hsdata_list_sources');
}

export function readHsdataSource(id: string) {
  return invoke<HsdataResolvedSource>('hsdata_read_source', { id });
}

export function importHsdataSource(id: string, dryRun: boolean, force: boolean) {
  return invoke<HsdataImportReport>('hsdata_import_source', {
    id,
    dryRun,
    force,
  });
}

/** Local Rust projection command executed against the configured desktop database. */
export function projectLocalHsdataSourceVersion(
  sourceTag: number,
  dryRun: boolean,
  force: boolean,
) {
  return invoke<HsdataProjectReport>('hsdata_project_source_version_local', {
    input: {
      sourceTag,
      dryRun,
      force,
    },
  });
}

/** Current local latest projection published to the configured remote target. */
export function publishCurrentHsdataToRemote() {
  return invoke<HsdataPublishReport>('hsdata_publish_current_to_remote');
}

/** Local hsdata source version rows loaded from the configured desktop database. */
export function listLocalHsdataSourceVersions() {
  return invoke<HsdataSourceVersionStatus[]>('hsdata_list_local_source_versions');
}

/** Local hsdata overview loaded from the configured desktop database. */
export function getLocalHsdataOverview() {
  return invoke<HsdataOverview>('hsdata_get_local_overview');
}

// hsdata import progress listener for the desktop window.
export function listenHsdataImportProgress(
  handler: (event: HsdataImportProgressEvent) => void,
) {
  return listen<HsdataImportProgressEvent>('hsdata-import-progress', event => {
    handler(event.payload);
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
