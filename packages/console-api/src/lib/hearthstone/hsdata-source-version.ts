import { desc } from 'drizzle-orm';

import { db } from '@tcg-cards/db/db';
import { SourceVersion } from '@tcg-cards/db/schema/hearthstone/data/card-model';

/** Import states returned for one hsdata sourceTag row. */
export type HsdataImportStatus = 'pending' | 'processing' | 'completed' | 'failed';

/** Projection states returned for one hsdata sourceTag row. */
export type HsdataProjectionStatus = 'not_started' | 'processing' | 'completed' | 'failed';

/** One sourceTag status row displayed by the desktop import page. */
export interface HsdataSourceVersionStatus {
  sourceTag:         number;
  build:             number | null;
  sourceCommit:      string;
  sourceUri:         string;
  importStatus:      HsdataImportStatus;
  importedAt:        string | null;
  projectionStatus:  HsdataProjectionStatus;
  projectedAt:       string | null;
  projectionError:   string | null;
}

/** ISO date string or null converted from database timestamp values. */
function normalizeDate(value: Date | string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return value.toISOString();
}

/** Source version status rows ordered for sourceTag-focused status display. */
export async function listHsdataSourceVersions(): Promise<HsdataSourceVersionStatus[]> {
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
    importStatus:     row.importStatus as HsdataImportStatus,
    importedAt:       normalizeDate(row.importedAt),
    projectionStatus: row.projectionStatus,
    projectedAt:      normalizeDate(row.projectedAt),
    projectionError:  row.projectionError,
  }));
}
