import z from 'zod';

import { eq } from 'drizzle-orm';

import { db } from '#db/db';
import { DocumentDefinition } from '#schema/magic/document';

import { os } from '../index';

import {
  deleteDocumentVersion,
  importDocumentVersion,
  listDocumentVersions,
  parseDocumentPreview,
} from '~~/server/lib/magic/document/importer';
import { documentConfigs } from '~~/server/lib/magic/document/config';

const documentId = z.enum(['magic-cr']);

const parsedNode = z.strictObject({
  id:           z.string(),
  documentId:   z.string(),
  versionId:    z.string(),
  nodeId:       z.string(),
  nodeKind:     z.enum(['heading', 'term', 'content', 'example']),
  path:         z.string(),
  level:        z.number(),
  parentNodeId: z.string().nullable(),
  siblingOrder: z.number(),
  content:      z.string().nullable(),
});

const listDefinitions = os
  .route({
    method:      'GET',
    description: 'List available document definitions',
    tags:        ['Magic', 'Document'],
  })
  .input(z.void())
  .output(z.array(z.strictObject({
    id:             documentId,
    slug:           z.string(),
    name:           z.string(),
    parserStrategy: z.string(),
    status:         z.enum(['active', 'archived']),
  })))
  .handler(async () => {
    const definitions = await db
      .select({
        id:             DocumentDefinition.id,
        slug:           DocumentDefinition.slug,
        name:           DocumentDefinition.name,
        parserStrategy: DocumentDefinition.parserStrategy,
        status:         DocumentDefinition.status,
      })
      .from(DocumentDefinition)
      .where(eq(DocumentDefinition.id, 'magic-cr'));

    if (definitions.length > 0) {
      return definitions.map(definition => ({
        ...definition,
        id: definition.id as 'magic-cr',
      }));
    }

    return Object.values(documentConfigs).map(config => ({
      id:             config.id,
      slug:           config.slug,
      name:           config.name,
      parserStrategy: config.parserStrategy,
      status:         'active' as const,
    }));
  });

const listVersions = os
  .route({
    method:      'GET',
    description: 'List imported document versions',
    tags:        ['Magic', 'Document'],
  })
  .input(z.object({
    documentId: documentId.default('magic-cr'),
  }))
  .output(z.array(z.strictObject({
    id:              z.string(),
    versionTag:      z.string(),
    effectiveDate:   z.string().nullable(),
    publishedAt:     z.string().nullable(),
    totalNodes:      z.number(),
    lifecycleStatus: z.enum(['active', 'superseded']),
    importStatus:    z.enum(['pending', 'processing', 'completed', 'failed']).nullable(),
    importError:     z.string().nullable(),
    importedAt:      z.date().nullable(),
    parserVersion:   z.string().nullable(),
  })))
  .handler(async ({ input }) => {
    return await listDocumentVersions(input.documentId);
  });

const parsePreview = os
  .route({
    method:      'POST',
    description: 'Parse document content and return preview',
    tags:        ['Magic', 'Document'],
  })
  .input(z.object({
    documentId: documentId.default('magic-cr'),
    content:    z.string().min(1),
    versionTag: z.string().regex(/^\d{8}$/).optional(),
  }))
  .output(z.strictObject({
    documentId:    documentId,
    versionId:     z.string(),
    versionTag:    z.string(),
    effectiveDate: z.string().nullable(),
    publishedAt:   z.string().nullable(),
    parserStrategy: z.string(),
    summary:       z.strictObject({
      heading: z.number(),
      term:    z.number(),
      content: z.number(),
      example: z.number(),
    }),
    sampleNodes:   parsedNode.array(),
  }))
  .handler(async ({ input }) => {
    const preview = parseDocumentPreview(input);
    return {
      documentId:    preview.documentId as 'magic-cr',
      versionId:     preview.versionId,
      versionTag:    preview.versionTag,
      effectiveDate: preview.effectiveDate,
      publishedAt:   preview.publishedAt,
      parserStrategy: preview.parserStrategy,
      summary:       preview.summary,
      sampleNodes:   preview.sampleNodes,
    };
  });

const importVersion = os
  .route({
    method:      'POST',
    description: 'Import document content into database',
    tags:        ['Magic', 'Document'],
  })
  .input(z.object({
    documentId: documentId.default('magic-cr'),
    content:    z.string().min(1),
    versionTag: z.string().regex(/^\d{8}$/).optional(),
  }))
  .output(z.strictObject({
    documentId:    documentId,
    versionId:     z.string(),
    versionTag:    z.string(),
    effectiveDate: z.string().nullable(),
    totalNodes:    z.number(),
    summary:       z.strictObject({
      heading: z.number(),
      term:    z.number(),
      content: z.number(),
      example: z.number(),
    }),
    importedAt: z.date(),
  }))
  .handler(async ({ input }) => {
    const result = await importDocumentVersion(input);
    return {
      documentId:    result.documentId as 'magic-cr',
      versionId:     result.versionId,
      versionTag:    result.versionTag,
      effectiveDate: result.effectiveDate,
      totalNodes:    result.totalNodes,
      summary:       result.summary,
      importedAt:    result.importedAt,
    };
  });

const removeVersion = os
  .route({
    method:      'DELETE',
    description: 'Delete an imported document version',
    tags:        ['Magic', 'Document'],
  })
  .input(z.object({
    versionId: z.string(),
  }))
  .output(z.void())
  .handler(async ({ input }) => {
    await deleteDocumentVersion(input.versionId);
  });

export const documentTrpc = {
  listDefinitions,
  listVersions,
  parsePreview,
  importVersion,
  delete: removeVersion,
};
