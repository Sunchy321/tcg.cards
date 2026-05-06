import { invoke } from '@tauri-apps/api/core';
import { getConsoleErrorMessage } from '@tcg-cards/console-core';

import { getDesktopGameRepo, setDesktopGameRepo } from './useDesktopSettings';

export interface HsdataSourceState {
  tag?:       string;
  commit?:    string;
  short?:     string;
  fileCount?: number;
  repoPath?:  string;
  dirty?:     boolean;
}

export type HsdataSourceKind = 'tag' | 'worktree';

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
  return invoke<HsdataSourceState>('hsdata_get_repo_state');
}

export function listHsdataSources() {
  return invoke<HsdataFile[]>('hsdata_list_sources');
}

export function readHsdataSource(id: string) {
  return invoke<HsdataResolvedSource>('hsdata_read_source', { id });
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
