import { ORPCError } from '@orpc/server';

import { os } from '#server/orpc';
import {
  cardImageRequirementExportInput,
  cardImageRequirementExportResult,
} from '#model/hearthstone/schema/data/image';

import { exportCardImageRequirements } from '~~/server/lib/hearthstone/card-image';

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

export const imageTrpc = {
  exportRequirements,
};
