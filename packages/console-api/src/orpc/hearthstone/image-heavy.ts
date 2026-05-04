import { ORPCError, os as create } from '@orpc/server';
import { z } from 'zod';

import {
  cardImageImportResult,
} from '@tcg-cards/model/src/hearthstone/schema/data/image';

import { importCardImageArchiveFromBrowser } from '../../lib/hearthstone/card-image';

interface ImageEnv {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  R2_ASSET?:        any;
  R2_ASSET_BUCKET?: string;
}

const os = create.$context<{ env: ImageEnv }>();

export const importArchive = os
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
      /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
      return await importCardImageArchiveFromBrowser({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        requirementContent: await (input.requirements as any).text() as string,
        manifest:           JSON.parse(input.manifest),
        files:              await Promise.all(input.files.map(async file => ({
          requestId: file.requestId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          bytes:     new Uint8Array(await (file.file as any).arrayBuffer() as ArrayBuffer),
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
