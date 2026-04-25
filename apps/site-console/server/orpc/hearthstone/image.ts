import { ORPCError } from '@orpc/server';
import { z } from 'zod';

import { os } from '#server/orpc';
import {
  cardImageImportResult,
  cardImageRequirementExportInput,
  cardImageRequirementExportResult,
} from '#model/hearthstone/schema/data/image';

import { exportCardImageRequirements, importCardImageArchiveFromBrowser } from '~~/server/lib/hearthstone/card-image';

const exportRequirements = os
  .route({
    method:      'POST',
    description: 'Export missing Hearthstone card image requirements as JSON',
    tags:        ['Console', 'Hearthstone', 'Image'],
  })
  .input(cardImageRequirementExportInput)
  .output(cardImageRequirementExportResult)
  .handler(async ({ context, input }) => {
    try {
      return await exportCardImageRequirements(input, {
        r2Bucket: context.env.R2_ASSET_BUCKET,
      });
    } catch (error) {
      if (error instanceof Error) {
        const code = error.message === 'No missing card images matched filters'
          ? 'NOT_FOUND'
          : 'BAD_REQUEST';

        throw new ORPCError(code, { message: error.message });
      }

      throw error;
    }
  });

const importArchive = os
  .route({
    method:      'POST',
    description: 'Import Hearthstone card image archive and upload converted WebP files to R2',
    tags:        ['Console', 'Hearthstone', 'Image'],
  })
  .input(z.object({
    requirements: z.file(),
    manifest:     z.string(),
    files:        z.array(z.object({
      requestId: z.string(),
      file:      z.file(),
    })),
  }))
  .output(cardImageImportResult)
  .handler(async ({ context, input }) => {
    try {
      return await importCardImageArchiveFromBrowser({
        requirementContent: await input.requirements.text(),
        manifest:           JSON.parse(input.manifest),
        files:              await Promise.all(input.files.map(async file => ({
          requestId: file.requestId,
          bytes:     new Uint8Array(await file.file.arrayBuffer()),
        }))),
        env: {
          R2_ASSET:        context.env.R2_ASSET,
          R2_ASSET_BUCKET: context.env.R2_ASSET_BUCKET,
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new ORPCError('BAD_REQUEST', { message: error.message });
      }

      throw error;
    }
  });

export const imageTrpc = {
  exportRequirements,
  importArchive,
};
