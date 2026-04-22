export interface HsdataSourceHistory {
  tag:    string;
  commit: string;
  type:   string;
  date:   string;
  count?: number;
  size?:  number;
}

export interface HsdataSourceState {
  tag?:        string;
  commit?:     string;
  short?:      string;
  synced_at?:  string;
  type?:       string;
  file_count?: number;
  history?:    HsdataSourceHistory[];
}

export interface HsdataFile {
  name:  string;
  size:  number;
  time?: string;
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

export interface ReportMetric {
  key:   string;
  label: string;
  value: string | number | boolean;
}

export const HSDATA_SOURCES = [
  {
    id:          'hsdata',
    name:        'Hearthstone Data (hsdata)',
    icon:        'i-lucide-database',
    official:    false,
    description: 'HearthSim 社区维护的炉石传说卡牌数据库，从游戏客户端提取的原始卡牌数据。',
    url:         'https://github.com/HearthSim/hsdata',
  },
] as const;

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

export function formatHsdataCount(value: number | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '-';
  }

  return new Intl.NumberFormat('zh-CN').format(value);
}

export function r2HsdataFileUri(name: string) {
  return `r2://R2_DATA/hearthstone/hsdata/data/${name}`;
}

const hsdataArchiveFileName = /^(\d{4,})-([a-z0-9][a-z0-9-]*)\.xml$/i;

function parsePositiveInteger(rawValue: string | undefined) {
  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function baseName(name: string) {
  return name.split('/').pop() ?? name;
}

export function inferHsdataSourceTag(name: string) {
  const fileName = baseName(name);
  const archiveMatch = fileName.match(hsdataArchiveFileName);
  const fallbackMatch = fileName.match(/(?:^|[^\d])(\d{5,})(?:[^\d]|$)/);

  return parsePositiveInteger(archiveMatch?.[1] ?? fallbackMatch?.[1]);
}

export function inferHsdataSourceCommit(name: string) {
  const match = baseName(name).match(hsdataArchiveFileName);
  const commit = match?.[2]?.toLowerCase();

  return commit && commit !== 'local' ? commit : null;
}

export function getHsdataErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败';
}
