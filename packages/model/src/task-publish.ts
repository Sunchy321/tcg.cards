import { z } from 'zod';

import { publishStream } from './game-data-sync';

export const publishTaskType = z.enum([
  'hsdata_publish',
]);

export const publishTaskScope = publishStream.extend({
  taskScopeType: z.literal('publish_stream').default('publish_stream'),
});

export const publishTaskParams = z.strictObject({
  publishType: z.string().trim().min(1).default('card_data'),
  dryRun: z.boolean().optional(),
  operationKind: z.enum(['publish']).default('publish'),
});

export const publishTaskCreateInput = z.strictObject({
  taskType: z.literal('hsdata_publish'),
  scope: publishStream,
  params: publishTaskParams,
});

export type PublishTaskType = z.infer<typeof publishTaskType>;
export type PublishTaskScope = z.infer<typeof publishTaskScope>;
export type PublishTaskParams = z.infer<typeof publishTaskParams>;
export type PublishTaskCreateInput = z.infer<typeof publishTaskCreateInput>;
