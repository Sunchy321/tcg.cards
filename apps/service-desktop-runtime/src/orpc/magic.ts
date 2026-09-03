import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';

import { taskPageSnapshot } from '@tcg-cards/model/task';
import { CardSlugResolution, ProjectionReview, ScryfallCard } from '@tcg-cards/db/schema/local/magic';

import { os } from './index';
import { createAndRunTask } from './task';
import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';
import { listMtgchArchives, listMtgjsonFiles, listScryfallFiles } from '../lib/magic/data-dir';
import { resolvePath } from '../lib/game-paths';
import { magicScryfallImportTaskDefinition } from '../lib/magic/task/scryfall-import';
import { magicMtgchImportTaskDefinition } from '../lib/magic/task/mtgch-import';
import { magicMtgjsonImportTaskDefinition } from '../lib/magic/task/mtgjson-import';
import { magicGathererImportTaskDefinition } from '../lib/magic/task/gatherer-import';
import { magicProjectTaskDefinition } from '../lib/magic/task/magic-project';

const magicDataFile = z.strictObject({
  name: z.string(),
  path: z.string(),
});

const magicDataState = z.strictObject({
  dataDir:  z.string().nullable(),
  scryfall: z.array(magicDataFile),
  mtgch:    z.strictObject({
    archives: z.array(magicDataFile),
  }),
  mtgjson: z.strictObject({
    dir:       z.string().nullable(),
    fileCount: z.number(),
  }),
});

const getDataState = os
  .route({
    method:      'GET',
    description: 'Read the configured Magic data directory and its discovered source files',
    tags:        ['Desktop Runtime', 'Magic'],
  })
  .output(magicDataState)
  .handler(async () => {
    const dataDir = resolvePath('magic.data');
    const scryfallDir = resolvePath('magic.data.scryfall');
    const mtgchDir = resolvePath('magic.data.mtgch');
    const mtgjsonDir = resolvePath('magic.data.mtgjson');
    const mtgjson = mtgjsonDir != null ? listMtgjsonFiles(mtgjsonDir) : { dir: null, fileCount: 0 };
    return {
      dataDir,
      scryfall: scryfallDir != null ? listScryfallFiles(scryfallDir) : [],
      mtgch:    { archives: mtgchDir != null ? listMtgchArchives(mtgchDir) : [] },
      mtgjson:  { dir: mtgjson.dir, fileCount: mtgjson.fileCount },
    };
  });

const scryfallImport = os
  .input(z.strictObject({
    cards:   z.string().optional(),
    rulings: z.string().optional(),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    return createAndRunTask(magicScryfallImportTaskDefinition.taskType, {
      taskType:          magicScryfallImportTaskDefinition.taskType,
      definitionVersion: magicScryfallImportTaskDefinition.definitionVersion,
      scope:             { type: magicScryfallImportTaskDefinition.scopeType, key: 'global', snapshot: {} },
      params:            { cards: input.cards, rulings: input.rulings },
    });
  });

const mtgchImport = os
  .input(z.strictObject({
    archive: z.string().min(1),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    return createAndRunTask(magicMtgchImportTaskDefinition.taskType, {
      taskType:          magicMtgchImportTaskDefinition.taskType,
      definitionVersion: magicMtgchImportTaskDefinition.definitionVersion,
      scope:             { type: magicMtgchImportTaskDefinition.scopeType, key: 'global', snapshot: {} },
      params:            { archive: input.archive },
    });
  });

const mtgjsonImport = os
  .input(z.strictObject({
    dir: z.string().min(1),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    return createAndRunTask(magicMtgjsonImportTaskDefinition.taskType, {
      taskType:          magicMtgjsonImportTaskDefinition.taskType,
      definitionVersion: magicMtgjsonImportTaskDefinition.definitionVersion,
      scope:             { type: magicMtgjsonImportTaskDefinition.scopeType, key: 'global', snapshot: {} },
      params:            { dir: input.dir },
    });
  });

const gathererImport = os
  .input(z.strictObject({
    level:       z.enum(['fill', 'refresh', 'refresh_all', 'force']).optional(),
    from:        z.number().int().min(1).optional(),
    to:          z.number().int().min(1).optional(),
    concurrency: z.number().int().min(1).max(16).optional(),
  }))
  .output(taskPageSnapshot)
  .handler(async ({ input }) => {
    return createAndRunTask(magicGathererImportTaskDefinition.taskType, {
      taskType:          magicGathererImportTaskDefinition.taskType,
      definitionVersion: magicGathererImportTaskDefinition.definitionVersion,
      scope:             { type: magicGathererImportTaskDefinition.scopeType, key: 'global', snapshot: {} },
      params:            { level: input.level, from: input.from, to: input.to, concurrency: input.concurrency },
    });
  });

const magicProject = os
  .input(z.strictObject({}))
  .output(taskPageSnapshot)
  .handler(async () => {
    return createAndRunTask(magicProjectTaskDefinition.taskType, {
      taskType:          magicProjectTaskDefinition.taskType,
      definitionVersion: magicProjectTaskDefinition.definitionVersion,
      scope:             { type: magicProjectTaskDefinition.scopeType, key: 'global', snapshot: {} },
      params:            {},
    });
  });

const slugConflictMember = z.strictObject({
  key:  z.string(),
  name: z.string().nullable(),
});

const slugConflictItem = z.strictObject({
  id:      z.string(),
  slug:    z.string(),
  reason:  z.string(),
  members: z.array(slugConflictMember),
});

/** List pending slug conflicts from the projection review queue. */
const listSlugConflicts = os
  .output(z.strictObject({ items: z.array(slugConflictItem) }))
  .handler(async () => {
    const db = getLocalDb();
    const rows = await db.select().from(ProjectionReview)
      .where(and(eq(ProjectionReview.kind, 'slug_conflict'), eq(ProjectionReview.status, 'pending')));

    const oracles = new Set<string>();
    for (const row of rows) {
      const members = ((row.payload as { members?: string[] }).members ?? []) as string[];
      for (const key of members) oracles.add(key.split(':')[0]!);
    }
    const oracleList = [...oracles];
    const names = new Map<string, string>();
    if (oracleList.length > 0) {
      const nameRows = await db.select({ oracleId: ScryfallCard.oracleId, name: ScryfallCard.name })
        .from(ScryfallCard)
        .where(and(eq(ScryfallCard.lang, 'en'), inArray(ScryfallCard.oracleId, oracleList as never)));
      for (const r of nameRows) names.set(String(r.oracleId), r.name);
    }

    const items = rows.map(row => {
      const subject = row.subject as { slug?: string };
      const payload = row.payload as { members?: string[]; reason?: string };
      return {
        id:      row.id,
        slug:    subject.slug ?? '',
        reason:  payload.reason ?? 'conflict',
        members: (payload.members ?? []).map(key => ({ key, name: names.get(key.split(':')[0]!) ?? null })),
      };
    });
    return { items };
  });

/** Resolve a slug conflict by assigning each member oracle a final slug. */
const resolveSlugConflict = os
  .input(z.strictObject({
    reviewId:    z.string(),
    assignments: z.array(z.strictObject({
      oracle: z.string(),
      slug:   z.string().min(1),
    })).min(1),
  }))
  .output(z.void())
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const review = await db.select().from(ProjectionReview)
      .where(and(eq(ProjectionReview.id, input.reviewId), eq(ProjectionReview.kind, 'slug_conflict')))
      .then(rows => rows[0]);
    if (review == null) throw new Error('slug conflict review not found');

    const baseSlug = (review.subject as { slug?: string }).slug ?? '';

    const slugToOracles = new Map<string, string[]>();
    for (const a of input.assignments) {
      const list = slugToOracles.get(a.slug) ?? [];
      if (!list.includes(a.oracle)) list.push(a.oracle);
      slugToOracles.set(a.slug, list);
    }

    const upsert = async (slug: string, oracleIds: string[], resolvedTo: string[]) => {
      await db.insert(CardSlugResolution)
        .values({ slug, oracleIds, resolvedTo })
        .onConflictDoUpdate({
          target: CardSlugResolution.slug,
          set:    { oracleIds, resolvedTo },
        });
    };

    const targets = [...slugToOracles.keys()];
    for (const [slug, oracleIds] of slugToOracles) {
      await upsert(slug, oracleIds, []);
    }
    // If nobody keeps the original collision slug, record it as an empty
    // tombstone row so future units with that natural slug are routed to review.
    if (!targets.includes(baseSlug) && baseSlug !== '') {
      await upsert(baseSlug, [], targets);
    }

    await db.update(ProjectionReview)
      .set({
        status:     'resolved',
        resolution: { mode: 'assign', assignments: input.assignments },
        resolvedAt: new Date(),
      })
      .where(eq(ProjectionReview.id, review.id));
  });

const slugMemberCard = z.strictObject({
  oracleId:   z.string(),
  name:       z.string(),
  typeLine:   z.string().nullable(),
  oracleText: z.string().nullable(),
  manaCost:   z.string().nullable(),
  colors:     z.array(z.string()).nullable(),
  power:      z.string().nullable(),
  toughness:  z.string().nullable(),
  setName:    z.string(),
});

/** Read-only view of one conflict member (its English oracle representative row). */
const slugMember = os
  .input(z.strictObject({ oracleId: z.string() }))
  .output(slugMemberCard)
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const row = await db.select().from(ScryfallCard)
      .where(and(eq(ScryfallCard.lang, 'en'), eq(ScryfallCard.oracleId, input.oracleId as never)))
      .then(rows => rows[0]);
    if (row == null) throw new Error('member oracle not found');
    return {
      oracleId:   input.oracleId,
      name:       row.name,
      typeLine:   row.typeLine,
      oracleText: row.oracleText,
      manaCost:   row.manaCost,
      colors:     row.colors,
      power:      row.power,
      toughness:  row.toughness,
      setName:    row.setName,
    };
  });

const reviewItem = z.strictObject({
  id:      z.string(),
  kind:    z.string(),
  subject: z.record(z.string(), z.unknown()),
  payload: z.record(z.string(), z.unknown()),
  slug:    z.string().optional(),
  reason:  z.string().optional(),
  members: z.array(slugConflictMember).optional(),
});

/** List all pending projection reviews (any kind) for the unified review UI. */
const reviewList = os
  .output(z.strictObject({ items: z.array(reviewItem) }))
  .handler(async () => {
    const db = getLocalDb();
    const rows = await db.select().from(ProjectionReview)
      .where(eq(ProjectionReview.status, 'pending'))
      .orderBy(ProjectionReview.kind);

    const slugRows = rows.filter(r => r.kind === 'slug_conflict');
    const oracles = new Set<string>();
    for (const row of slugRows) {
      const members = ((row.payload as { members?: string[] }).members ?? []) as string[];
      for (const key of members) oracles.add(key.split(':')[0]!);
    }
    const names = new Map<string, string>();
    const oracleList = [...oracles];
    if (oracleList.length > 0) {
      const nameRows = await db.select({ oracleId: ScryfallCard.oracleId, name: ScryfallCard.name })
        .from(ScryfallCard)
        .where(and(eq(ScryfallCard.lang, 'en'), inArray(ScryfallCard.oracleId, oracleList as never)));
      for (const r of nameRows) names.set(String(r.oracleId), r.name);
    }

    type ReviewItemOut = z.infer<typeof reviewItem>;
    const items = rows.map(row => {
      const subject = row.subject as Record<string, unknown>;
      const payload = row.payload as { members?: string[]; reason?: string };
      const base: ReviewItemOut = { id: row.id, kind: row.kind, subject, payload };
      if (row.kind === 'slug_conflict') {
        base.slug = (subject.slug as string | undefined);
        base.reason = payload.reason;
        base.members = (payload.members ?? []).map(key => ({ key, name: names.get(key.split(':')[0]!) ?? null }));
      }
      return base;
    });
    return { items };
  });

export const magicRouter = {
  getDataState,
  createTask: { scryfallImport, mtgchImport, mtgjsonImport, gathererImport, magicProject },
  slug:       { listConflicts: listSlugConflicts, resolveConflict: resolveSlugConflict, member: slugMember },
  review:     { list: reviewList },
};
