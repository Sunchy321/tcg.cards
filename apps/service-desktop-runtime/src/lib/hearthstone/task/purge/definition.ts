import { z } from 'zod';
import { and, count, eq, inArray, isNotNull, or } from 'drizzle-orm';

import { createDefinition } from '#task/definition';
import type { LocalDb } from '../../hsdata-local-db';
import { getLocalDb } from '../../hsdata-local-db';
import { getHearthstoneImageSettings, requireHearthstoneImageBucketDir } from '../../image-config';
import {
  BaseEntity,
  BaseEntityLocalization,
  BaseEntityRelation,
  CardImageAsset,
  EntityLocalization,
} from '@tcg-cards/db/schema/local/hearthstone';
import { computeOrphanedRenderHashes } from './orphan';
import { deleteImageFiles, locateImageFiles } from './files';

export const hearthstonePurgeTaskType = 'hearthstone_purge';

const purgeOutput = z.object({
  dryRun:             z.boolean(),
  entities:           z.number(),
  localizations:      z.number(),
  relations:          z.number(),
  images:             z.object({ assets: z.number(), files: z.number() }),
  orphanRenderHashes: z.number(),
  failures:           z.number(),
});

type EntityKey = Pick<typeof BaseEntity.$inferSelect, 'cardId' | 'revisionHash'>;
type LocalizationKey = Pick<typeof BaseEntityLocalization.$inferSelect, 'cardId' | 'lang' | 'revisionHash' | 'localizationHash'>;
type RelationKey = Pick<typeof BaseEntityRelation.$inferSelect, 'sourceId' | 'relation' | 'targetId' | 'sourceRevisionHash'>;

interface PurgeCtx {
  dryRun:               boolean;
  orphanedRenderHashes: Set<string>;
  imageFiles:           string[];
  imageIndex:           number;
  deleteKeys: {
    entities:      EntityKey[];
    localizations: LocalizationKey[];
    relations:     RelationKey[];
  };
  cleanIndex:    number;
  cleanTotal:    number;
  filesDeleted:  number;
  assetsDeleted: number;
  rowDeletes:    { entities: number, localizations: number, relations: number };
  failures:      number;
}

const DELETE_CHUNK = 500;

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function deleteEntityChunk(db: LocalDb, keys: EntityKey[], dryRun: boolean): Promise<number> {
  if (keys.length === 0) return 0;
  if (dryRun) return keys.length;
  const where = or(...keys.map(k => and(eq(BaseEntity.cardId, k.cardId), eq(BaseEntity.revisionHash, k.revisionHash))));
  const deleted = await db.delete(BaseEntity).where(where).returning({ cardId: BaseEntity.cardId });
  return deleted.length;
}

async function deleteLocalizationChunk(db: LocalDb, keys: LocalizationKey[], dryRun: boolean): Promise<number> {
  if (keys.length === 0) return 0;
  if (dryRun) return keys.length;
  const where = or(...keys.map(k => and(
    eq(BaseEntityLocalization.cardId, k.cardId),
    eq(BaseEntityLocalization.lang, k.lang),
    eq(BaseEntityLocalization.revisionHash, k.revisionHash),
    eq(BaseEntityLocalization.localizationHash, k.localizationHash),
  )));
  const deleted = await db.delete(BaseEntityLocalization).where(where).returning({ cardId: BaseEntityLocalization.cardId });
  return deleted.length;
}

async function deleteRelationChunk(db: LocalDb, keys: RelationKey[], dryRun: boolean): Promise<number> {
  if (keys.length === 0) return 0;
  if (dryRun) return keys.length;
  const where = or(...keys.map(k => and(
    eq(BaseEntityRelation.sourceId, k.sourceId),
    eq(BaseEntityRelation.relation, k.relation),
    eq(BaseEntityRelation.targetId, k.targetId),
    eq(BaseEntityRelation.sourceRevisionHash, k.sourceRevisionHash),
  )));
  const deleted = await db.delete(BaseEntityRelation).where(where).returning({ sourceId: BaseEntityRelation.sourceId });
  return deleted.length;
}

export const hearthstonePurgeTaskDefinition = createDefinition(hearthstonePurgeTaskType, { version: '2026-08-07:v1' })
  .scope(
    z.object({}),
    { type: 'purge' as const, resolve: () => ({ key: 'hearthstone:purge', snapshot: {} }) },
  )
  .input(z.strictObject({ dryRun: z.boolean().optional() }))
  .output(purgeOutput)
  .context({
    init: (input): PurgeCtx => ({
      dryRun:               input.dryRun ?? false,
      orphanedRenderHashes: new Set<string>(),
      imageFiles:           [],
      imageIndex:           0,
      deleteKeys:           { entities: [], localizations: [], relations: [] },
      cleanIndex:           0,
      cleanTotal:           0,
      filesDeleted:         0,
      assetsDeleted:        0,
      rowDeletes:           { entities: 0, localizations: 0, relations: 0 },
      failures:             0,
    }),
  })

  // ── Stage 1: deleting_images (chunked, bounded, skipped when bucketDir is unconfigured) ──
  .stage('deleting_images', { label: 'Delete images', progressMode: 'bounded' })
  .enable({
    when:      () => getHearthstoneImageSettings().bucketDir != null,
    otherwise: () => ({ filesDeleted: 0, orphanRenderHashes: 0 }),
  })
  .entry(async ({ ctx }) => {
    const db = getLocalDb();
    const liveHashes = (await db.select({ renderHash: EntityLocalization.renderHash })
      .from(EntityLocalization)
      .where(isNotNull(EntityLocalization.renderHash)))
      .map(r => r.renderHash)
      .filter((h): h is string => h != null);
    const softHashes = (await db.select({ renderHash: BaseEntityLocalization.renderHash })
      .from(BaseEntityLocalization)
      .where(and(isNotNull(BaseEntityLocalization.deletedAt), isNotNull(BaseEntityLocalization.renderHash))))
      .map(r => r.renderHash)
      .filter((h): h is string => h != null);

    ctx.orphanedRenderHashes = computeOrphanedRenderHashes(softHashes, liveHashes);

    const bucketDir = requireHearthstoneImageBucketDir();
    const files = await locateImageFiles(bucketDir, ctx.orphanedRenderHashes);
    ctx.imageFiles = files;
    ctx.imageIndex = 0;
    return { total: files.length, blockInput: {} };
  })
  .block(async ({ ctx, progress, done }) => {
    const chunk = ctx.imageFiles.slice(ctx.imageIndex * DELETE_CHUNK, (ctx.imageIndex + 1) * DELETE_CHUNK);
    if (chunk.length === 0) {
      return done({});
    }
    const result = ctx.dryRun
      ? { deleted: chunk.length, failed: 0 }
      : await deleteImageFiles(chunk);
    ctx.filesDeleted += result.deleted;
    if (result.failed > 0) {
      throw new Error(`Failed to delete ${result.failed} image files`);
    }
    ctx.imageIndex += 1;
    progress({
      done:  Math.min(ctx.imageIndex * DELETE_CHUNK, ctx.imageFiles.length),
      total: ctx.imageFiles.length,
    });
    return {};
  })
  .exit(async ({ ctx }) => ({
    filesDeleted:       ctx.filesDeleted,
    orphanRenderHashes: ctx.orphanedRenderHashes.size,
  }))

  // ── Stage 2: cleaning_tables (chunked, bounded) ──
  .stage('cleaning_tables', { label: 'Clean tables', progressMode: 'bounded' })
  .entry(async ({ ctx }) => {
    const db = getLocalDb();
    const entityKeys = await db.select({
      cardId:       BaseEntity.cardId,
      revisionHash: BaseEntity.revisionHash,
    }).from(BaseEntity).where(isNotNull(BaseEntity.deletedAt));
    const locKeys = await db.select({
      cardId:           BaseEntityLocalization.cardId,
      lang:             BaseEntityLocalization.lang,
      revisionHash:     BaseEntityLocalization.revisionHash,
      localizationHash: BaseEntityLocalization.localizationHash,
    }).from(BaseEntityLocalization).where(isNotNull(BaseEntityLocalization.deletedAt));
    const relKeys = await db.select({
      sourceId:           BaseEntityRelation.sourceId,
      relation:           BaseEntityRelation.relation,
      targetId:           BaseEntityRelation.targetId,
      sourceRevisionHash: BaseEntityRelation.sourceRevisionHash,
    }).from(BaseEntityRelation).where(isNotNull(BaseEntityRelation.deletedAt));

    ctx.deleteKeys = { entities: entityKeys, localizations: locKeys, relations: relKeys };
    ctx.cleanIndex = 0;
    const total = entityKeys.length + locKeys.length + relKeys.length;
    ctx.cleanTotal = total;
    return { total, blockInput: {} };
  })
  .block(async ({ ctx, progress, done }) => {
    const db = getLocalDb();
    const keys = ctx.deleteKeys;
    const start = ctx.cleanIndex * DELETE_CHUNK;
    const entityChunk = keys.entities.slice(start, start + DELETE_CHUNK);
    const locChunk = keys.localizations.slice(start, start + DELETE_CHUNK);
    const relChunk = keys.relations.slice(start, start + DELETE_CHUNK);

    if (entityChunk.length + locChunk.length + relChunk.length === 0) {
      if (ctx.orphanedRenderHashes.size > 0) {
        for (const hashes of chunked([...ctx.orphanedRenderHashes], DELETE_CHUNK)) {
          if (ctx.dryRun) {
            const [row] = await db.select({ count: count() })
              .from(CardImageAsset)
              .where(inArray(CardImageAsset.renderHash, hashes));
            ctx.assetsDeleted += Number(row?.count ?? 0);
          } else {
            try {
              const result = await db.delete(CardImageAsset)
                .where(inArray(CardImageAsset.renderHash, hashes))
                .returning({ renderHash: CardImageAsset.renderHash });
              ctx.assetsDeleted += result.length;
            } catch {
              ctx.failures += 1;
            }
          }
        }
      }
      return done({});
    }

    let eCount = 0;
    let lCount = 0;
    let rCount = 0;
    try {
      eCount = await deleteEntityChunk(db, entityChunk, ctx.dryRun);
    } catch {
      ctx.failures += entityChunk.length;
    }
    try {
      lCount = await deleteLocalizationChunk(db, locChunk, ctx.dryRun);
    } catch {
      ctx.failures += locChunk.length;
    }
    try {
      rCount = await deleteRelationChunk(db, relChunk, ctx.dryRun);
    } catch {
      ctx.failures += relChunk.length;
    }
    ctx.rowDeletes.entities += eCount;
    ctx.rowDeletes.localizations += lCount;
    ctx.rowDeletes.relations += rCount;
    ctx.cleanIndex += 1;

    progress({ done: Math.min(start + DELETE_CHUNK, ctx.cleanTotal), total: ctx.cleanTotal });
    return {};
  })
  .exit(async ({ ctx }) => ({
    entities:      ctx.rowDeletes.entities,
    localizations: ctx.rowDeletes.localizations,
    relations:     ctx.rowDeletes.relations,
    assets:        ctx.assetsDeleted,
  }))

  // ── Stage 3: finalizing (simple) ──
  .stage('finalizing', { label: 'Finalize', progressMode: 'simple' })
  .handler(async ({ ctx }) => ({
    dryRun:             ctx.dryRun,
    entities:           ctx.rowDeletes.entities,
    localizations:      ctx.rowDeletes.localizations,
    relations:          ctx.rowDeletes.relations,
    images:             { assets: ctx.assetsDeleted, files: ctx.filesDeleted },
    orphanRenderHashes: ctx.orphanedRenderHashes.size,
    failures:           ctx.failures,
  }))
  .build();
