import { ORPCError, os as create } from '@orpc/server';

import {
  type CardImageRequirementExportInput,
  cardImageRequirementExportInput,
  cardImageRequirementExportResult,
} from '@tcg-cards/model/src/hearthstone/schema/data/image';

import { exportCardImageRequirements } from '../../lib/hearthstone/card-image';

interface ImageEnv {
  R2_ASSET_BUCKET?: string;
}

const os = create.$context<{ env: ImageEnv }>();

export const exportRequirements = os
  .route({
    method:      'POST',
    description: 'Export missing Hearthstone card image requirements as JSON',
    tags:        ['Console', 'Hearthstone', 'Image'],
  })
  .input(cardImageRequirementExportInput)
  .output(cardImageRequirementExportResult)
  .handler(async ({ context, input }: { context: { env: ImageEnv }, input: CardImageRequirementExportInput }) => {
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
