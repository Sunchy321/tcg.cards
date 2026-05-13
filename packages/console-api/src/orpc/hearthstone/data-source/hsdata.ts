import { ORPCError, os } from '@orpc/server';
import { z } from 'zod';

import { projectHsdata } from '../../../lib/hearthstone/hsdata-project';

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
};

export const hsdataFull = {
  projectSourceVersion,
};
