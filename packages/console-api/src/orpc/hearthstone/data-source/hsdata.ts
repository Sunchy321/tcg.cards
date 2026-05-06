import { ORPCError, os } from '@orpc/server';
import { z } from 'zod';

import { importHsdata } from '../../../lib/hearthstone/hsdata-import';
import { getHsdataOverview } from '../../../lib/hearthstone/hsdata-overview';
import { projectHsdata } from '../../../lib/hearthstone/hsdata-project';

const hsdataImportInput = z.object({
  xml:          z.string().min(1),
  sourceTag:    z.number().int().positive(),
  sourceCommit: z.string().trim().min(1).optional().nullable(),
  sourceUri:    z.string().trim().min(1).optional().nullable(),
  dryRun:       z.boolean().optional(),
  force:        z.boolean().optional(),
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

const getOverview = os
  .route({
    method:      'GET',
    description: 'Get hsdata data table overview',
    tags:        ['Console', 'Hearthstone', 'DataSource'],
  })
  .input(z.void())
  .output(hsdataOverview)
  .handler(async () => await getHsdataOverview());

const importArchive = os
  .route({
    method:      'POST',
    description: 'Import one hsdata XML snapshot into Hearthstone raw archive tables',
    tags:        ['Console', 'Hearthstone', 'DataSource'],
  })
  .input(hsdataImportInput)
  .output(hsdataImportReport)
  .handler(async ({ input }) => {
    try {
      return await importHsdata({
        xml:          input.xml,
        sourceTag:    input.sourceTag,
        sourceCommit: input.sourceCommit,
        sourceUri:    input.sourceUri,
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

export const hsdataLight = {
  getOverview,
};

export const hsdataFull = {
  getOverview,
  importArchive,
  projectSourceVersion,
};
