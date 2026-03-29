import { os } from '@orpc/server';
import { z } from 'zod';
import { db } from '#db/db';
import { and, desc, eq } from 'drizzle-orm';
import { RuleSource, RuleEntity, RuleNode, RuleChange } from '#schema/magic/rule';
import { parseAndCompressRuleFile, importRuleVersion } from '#server/lib/magic/rule';

const list = os
  .route({
    method:      'GET',
    description: 'List all rule versions',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.void())
  .output(z.strictObject({
    id:            z.string(),
    effectiveDate: z.string().nullable(),
    publishedAt:   z.string().nullable(),
    totalRules:    z.number().nullable(),
    status:        z.string(),
    importedAt:    z.date().nullable(),
  }).array())
  .handler(async () => {
    return await db
      .select({
        id:            RuleSource.id,
        effectiveDate: RuleSource.effectiveDate,
        publishedAt:   RuleSource.publishedAt,
        totalRules:    RuleSource.totalRules,
        status:        RuleSource.status,
        importedAt:    RuleSource.importedAt,
      })
      .from(RuleSource)
      .orderBy(desc(RuleSource.effectiveDate));
  })
  .callable();

const get = os
  .route({
    method:      'GET',
    description: 'Get rule version details',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    id: z.string(),
  }))
  .output(z.strictObject({
    id:            z.string(),
    effectiveDate: z.string().nullable(),
    publishedAt:   z.string().nullable(),
    txtUrl:        z.string().nullable(),
    pdfUrl:        z.string().nullable(),
    docxUrl:       z.string().nullable(),
    totalRules:    z.number().nullable(),
    status:        z.string(),
    importedAt:    z.date().nullable(),
  }))
  .handler(async ({ input }) => {
    const result = await db
      .select()
      .from(RuleSource)
      .where(eq(RuleSource.id, input.id))
      .limit(1);

    if (!result[0]) {
      throw new Error('Rule version not found');
    }

    return result[0];
  })
  .callable();

const importFromText = os
  .route({
    method:      'POST',
    description: 'Import rule version from text content',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    sourceId:      z.string(),
    content:       z.string(),
    effectiveDate: z.string().optional(),
    publishedAt:   z.string().optional(),
    txtUrl:        z.string().optional(),
  }))
  .output(z.strictObject({
    success:          z.boolean(),
    sourceId:         z.string(),
    totalNodes:       z.number(),
    newEntities:      z.number(),
    existingEntities: z.number(),
    changes:          z.strictObject({
      added:    z.number(),
      removed:  z.number(),
      modified: z.number(),
      renamed:  z.number(),
      moved:    z.number(),
      split:    z.number(),
      merged:   z.number(),
    }),
  }))
  .handler(async ({ input }) => {
    const { source, contents } = await parseAndCompressRuleFile(input.sourceId, input.content);

    // Override with provided metadata
    if (input.effectiveDate) {
      source.effectiveDate = input.effectiveDate;
    }
    if (input.publishedAt) {
      source.publishedAt = input.publishedAt;
    }

    const result = await importRuleVersion(source, contents, {
      txtUrl:      input.txtUrl,
      publishedAt: input.publishedAt,
    });

    return {
      success: true,
      ...result,
    };
  })
  .callable();

const getChanges = os
  .route({
    method:      'GET',
    description: 'Get changes between versions',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    fromSourceId: z.string(),
    toSourceId:   z.string(),
  }))
  .output(z.strictObject({
    id:           z.string(),
    fromSourceId: z.string(),
    toSourceId:   z.string(),
    entityId:     z.string(),
    fromNodeId:   z.string().nullable(),
    toNodeId:     z.string().nullable(),
    type:         z.string(),
    details:      z.string(),
    createdAt:    z.date(),
  }).array())
  .handler(async ({ input }) => {
    return await db
      .select()
      .from(RuleChange)
      .where(and(
        eq(RuleChange.fromSourceId, input.fromSourceId),
        eq(RuleChange.toSourceId, input.toSourceId)),
      )
      .orderBy(desc(RuleChange.createdAt));
  })
  .callable();

const getEntityHistory = os
  .route({
    method:      'GET',
    description: 'Get entity revision history',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    entityId: z.string(),
  }))
  .output(z.strictObject({
    entity: z.strictObject({
      id:              z.string(),
      currentNodeId:   z.string().nullable(),
      currentRuleId:   z.string().nullable(),
      currentSourceId: z.string().nullable(),
      totalRevisions:  z.number(),
      createdAt:       z.date(),
    }),
    revisions: z.strictObject({
      sourceId:   z.string(),
      ruleId:     z.string(),
      title:      z.string().nullable(),
      changeType: z.string().nullable(),
    }).array(),
  }))
  .handler(async ({ input }) => {
    const entity = await db
      .select()
      .from(RuleEntity)
      .where(eq(RuleEntity.id, input.entityId))
      .limit(1)
      .then(rows => rows[0]);

    if (!entity) {
      throw new Error('Entity not found');
    }

    const nodes = await db
      .select({
        sourceId: RuleNode.sourceId,
        ruleId:   RuleNode.ruleId,
        title:    RuleNode.title,
      })
      .from(RuleNode)
      .where(eq(RuleNode.entityId, input.entityId))
      .orderBy(RuleNode.sourceId);

    const changes = await db
      .select({
        entityId:   RuleChange.entityId,
        type:       RuleChange.type,
        toSourceId: RuleChange.toSourceId,
      })
      .from(RuleChange)
      .where(eq(RuleChange.entityId, input.entityId));

    const changeMap = new Map(changes.map(c => [c.toSourceId, c.type]));

    const revisions = nodes.map(node => ({
      sourceId:   node.sourceId,
      ruleId:     node.ruleId,
      title:      node.title,
      changeType: changeMap.get(node.sourceId) || null,
    }));

    return {
      entity,
      revisions,
    };
  })
  .callable();

const deleteVersion = os
  .route({
    method:      'DELETE',
    description: 'Delete a rule version',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    id: z.string(),
  }))
  .output(z.void())
  .handler(async ({ input }) => {
    await db.transaction(async tx => {
      // Delete changes referencing this version
      await tx.delete(RuleChange)
        .where(eq(RuleChange.fromSourceId, input.id));
      await tx.delete(RuleChange)
        .where(eq(RuleChange.toSourceId, input.id));

      // Delete nodes
      await tx.delete(RuleNode)
        .where(eq(RuleNode.sourceId, input.id));

      // Delete source
      await tx.delete(RuleSource)
        .where(eq(RuleSource.id, input.id));
    });
  })
  .callable();

export const ruleTrpc = {
  list,
  get,
  importFromText,
  getChanges,
  getEntityHistory,
  delete: deleteVersion,
};
