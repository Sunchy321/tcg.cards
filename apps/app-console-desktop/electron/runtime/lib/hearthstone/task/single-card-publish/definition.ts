import { z } from 'zod';

import { createDefinition } from '#task/definition';
import { publishSingleCard, singleCardPublishReport } from '../../hsdata-publish';

export const singleCardPublishTaskType = 'hearthstone_single_card_publish';

const scope = z.strictObject({
  cardId:        z.string().trim().min(1),
  publishTarget: z.literal('hearthstone'),
  environment:   z.string().trim().min(1),
});

const input = z.strictObject({
  cardId:         z.string().trim().min(1),
  publishTarget:  z.literal('hearthstone'),
  environment:    z.string().trim().min(1),
  operatorUserId: z.string().trim().min(1).optional(),
});

/** Runs the existing single-card transaction as an Electron-managed publish task. */
export const singleCardPublishTaskDefinition = createDefinition(singleCardPublishTaskType, {
  version: '2026-10-25:v1',
})
  .scope(scope, {
    type:    'publish_stream',
    resolve: value => ({
      key:      `${value.publishTarget}:${value.environment}:card_data:${value.cardId}`,
      snapshot: { ...value, publishType: 'card_data' },
    }),
  })
  .input(input)
  .output(singleCardPublishReport)
  .context({
    init: (_input, value) => value,
  })
  .stage('publish-card', { label: '发布单张卡牌', progressMode: 'simple' })
  .handler(async ({ ctx }) => publishSingleCard(ctx.cardId, {
    publishTarget: ctx.publishTarget,
    environment:   ctx.environment,
  }))
  .build();
