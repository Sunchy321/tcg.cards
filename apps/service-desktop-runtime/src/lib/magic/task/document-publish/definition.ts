import { z } from 'zod';

import { createDefinition } from '../../../task/definition';
import { publishDocuments } from '../../document-publish';

/** Identifies collection-wide static document publication tasks. */
export const documentPublishTaskType = 'magic_document_publish';

const scope = z.object({
  publishTarget:     z.string().trim().min(1),
  environment:       z.string().trim().min(1),
  targetFingerprint: z.string().trim().min(1),
});

const output = z.object({
  documents:    z.number(), translations: z.number(), revisions:    z.number(),
  nodes:        z.number(), releases:     z.number(), dryRun:       z.boolean(),
});

/** Publishes the complete static collection as one retriable remote transaction. */
export const documentPublishTaskDefinition = createDefinition(documentPublishTaskType, { version: '2026-10-19:v1' })
  .scope(scope, {
    type:    'publish_stream',
    resolve: value => ({ key: `${value.publishTarget}:${value.environment}:static_documents`, snapshot: value }),
  })
  .input(z.object({ dryRun: z.boolean().default(false) }))
  .output(output)
  .context({ init: (input, target) => ({ ...target, dryRun: input.dryRun }) })
  .stage('publish_documents', { label: '发布静态文档', progressMode: 'simple' })
  .handler(({ ctx }) => publishDocuments(ctx))
  .build();
