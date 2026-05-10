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

/** Desktop hsdata import phases emitted by the staged upload workflow. */
export type HsdataImportPhase =
  | 'preparing'
  | 'prepared'
  | 'creating_job'
  | 'uploading'
  | 'ready_to_finalize'
  | 'finalizing'
  | 'completed'
  | 'failed';

/** Desktop hsdata import progress event payload. */
export interface HsdataImportProgressEvent {
  sourceId:            string;
  sourceTag:           number | null;
  jobId:               string | null;
  phase:               HsdataImportPhase | string;
  message:             string;
  totalChunkCount:     number | null;
  completedChunkCount: number | null;
  totalEntityCount:    number | null;
  currentChunkIndex:   number | null;
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
