import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { ORPCError } from '@orpc/server';

import { taskPageSnapshot } from '@tcg-cards/model/task';
import { CardSlugResolution, ProjectionReview, ScryfallCard } from '@tcg-cards/db/schema/local/magic';

import { os } from './index';
import { createAndRunTask } from './task';
import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';
import { isArtBackDoubleFacedToken } from '../lib/magic/match';
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

/**
 * Resolve display names for member unit keys. A DFT member key has the form
 * `oracleId:faceIndex` and should show the FACE name, not the object's joined
 * name (e.g. an `Angel // Demon` double-faced token's Angel face shows "Angel").
 */
async function resolveMemberNames(keys: string[]): Promise<{ names: Map<string, string>, releases: Map<string, string> }> {
  const names = new Map<string, string>();
  const releases = new Map<string, string>();
  const oracles = [...new Set(keys.map(k => k.split(':')[0]!))].filter(Boolean);
  if (oracles.length === 0) return { names, releases };

  const db = getLocalDb();
  const rows = await db.select({
    oracleId:   ScryfallCard.oracleId,
    name:       ScryfallCard.name,
    releasedAt: ScryfallCard.releasedAt,
    cardFaces:  ScryfallCard.cardFaces,
  }).from(ScryfallCard)
    .where(and(eq(ScryfallCard.lang, 'en'), inArray(ScryfallCard.oracleId, oracles as never)));

  const byOracle = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (!byOracle.has(String(r.oracleId))) byOracle.set(String(r.oracleId), r);
  }

  for (const key of keys) {
    const [oid, idxStr] = key.split(':');
    const row = byOracle.get(oid!);
    if (!row) continue;
    releases.set(key, String(row.releasedAt));
    const face = unitViewFace({ name: row.name, cardFaces: row.cardFaces as FaceLike[] | null }, idxStr);
    names.set(key, face?.name ?? row.name);
  }
  return { names, releases };
}

/** List pending slug conflicts from the projection review queue. */
const listSlugConflicts = os
  .output(z.strictObject({ items: z.array(slugConflictItem) }))
  .handler(async () => {
    const db = getLocalDb();
    const rows = await db.select().from(ProjectionReview)
      .where(and(eq(ProjectionReview.kind, 'slug_conflict'), eq(ProjectionReview.status, 'pending')));

    const keys = rows.flatMap(row => ((row.payload as { members?: string[] }).members ?? []) as string[]);
    const { names, releases } = await resolveMemberNames(keys);
    const sortMembers = (members: string[]) =>
      [...members].sort((a, b) =>
        (releases.get(a) ?? '9999').localeCompare(releases.get(b) ?? '9999') || a.localeCompare(b),
      );

    const items = rows.map(row => {
      const subject = row.subject as { slug?: string };
      const payload = row.payload as { members?: string[], reason?: string };
      return {
        id:      row.id,
        slug:    subject.slug ?? '',
        reason:  payload.reason ?? 'conflict',
        members: sortMembers(payload.members ?? []).map(key => ({ key, name: names.get(key) ?? null })),
      };
    });
    return { items };
  });

type FaceLike = {
  name?: string; type_line?: string; oracle_text?: string | null; mana_cost?: string | null;
  colors?: string[] | null; power?: string | null; toughness?: string | null;
};

/**
 * Face content behind a unit key. A bare-oracleId key normally means a
 * whole-card unit whose top-level row fields ARE the card, but an art-back
 * double_faced_token is collapsed by match into a front-face-only unit still
 * keyed by bare oracle id — its view must read face 0, because the top-level
 * fields carry the combined "A // B" data of the art back.
 */
function unitViewFace(row: { name: string, cardFaces: FaceLike[] | null }, idxStr: string | null | undefined): FaceLike | undefined {
  const faces = row.cardFaces ?? [];
  if (idxStr != null) return faces[Number(idxStr)];
  const artBack = isArtBackDoubleFacedToken(
    faces.map(f => f.name ?? ''),
    faces.map(f => ({ oracleText: f.oracle_text ?? null, power: f.power ?? null, toughness: f.toughness ?? null })),
  );
  return artBack ? faces[0] : undefined;
}

/**
 * Returns merged slugs whose member units disagree on non-localized card data,
 * together with the differing fields/values. Units are compared at FACE level
 * for DFT keys (`oracleId:face`), never the joined double-faced top-level data.
 */
async function inconsistentMergedSlugs(db: ReturnType<typeof getLocalDb>, groups: Map<string, string[]>): Promise<{ slug: string, details: string[] }[]> {
  const mergedGroups = [...groups.entries()].filter(([, units]) => units.length > 1);
  const out: { slug: string, details: string[] }[] = [];

  const oracles = [...new Set(mergedGroups.flatMap(([, units]) => units.map(u => u.split(':')[0]!)))];
  const rows = await db.select({
    oracleId:   ScryfallCard.oracleId,
    name:       ScryfallCard.name,
    typeLine:   ScryfallCard.typeLine,
    oracleText: ScryfallCard.oracleText,
    colors:     ScryfallCard.colors,
    power:      ScryfallCard.power,
    toughness:  ScryfallCard.toughness,
    cardFaces:  ScryfallCard.cardFaces,
  }).from(ScryfallCard)
    .where(and(eq(ScryfallCard.lang, 'en'), inArray(ScryfallCard.oracleId, oracles as never)));

  const rowByOracle = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (!rowByOracle.has(String(r.oracleId))) rowByOracle.set(String(r.oracleId), r);
  }

  interface View { name: string; typeLine: string; oracleText: string; colors: string; power: string; toughness: string }
  const viewOf = (unit: string): View | null => {
    const [oid, idxStr] = unit.split(':');
    const row = rowByOracle.get(oid!);
    if (!row) return null;
    const f = unitViewFace({ name: row.name, cardFaces: row.cardFaces as FaceLike[] | null }, idxStr);
    return {
      name:       f?.name ?? row.name,
      typeLine:   (f?.type_line ?? row.typeLine ?? '').replace(/\s+/g, ' ').trim(),
      oracleText: (f?.oracle_text ?? row.oracleText ?? '').replace(/\s+/g, ' ').trim(),
      colors:     [...(f?.colors ?? row.colors ?? [])].sort().join(''),
      power:      (f?.power ?? row.power ?? '').trim(),
      toughness:  (f?.toughness ?? row.toughness ?? '').trim(),
    };
  };

  const fields = [
    { get: (v: View) => v.name, label: '名称' },
    { get: (v: View) => v.typeLine, label: '类别行' },
    { get: (v: View) => v.oracleText, label: '规则文字' },
    { get: (v: View) => v.colors, label: '颜色' },
    { get: (v: View) => v.power, label: '力量' },
    { get: (v: View) => v.toughness, label: '防御' },
  ] as const;

  for (const [slug, units] of mergedGroups) {
    const views = units.map(u => ({ unit: u, view: viewOf(u) }));
    if (views.some(v => v.view == null)) {
      throw new ORPCError('BAD_REQUEST', { message: `无法合并「${slug}」：缺少成员数据。` });
    }
    const details: string[] = [];
    for (const f of fields) {
      if (new Set(views.map(v => f.get(v.view!))).size > 1) {
        const shown = views.map(v => {
          const raw = f.get(v.view!);
          return `[${v.view!.name} → ${raw.length > 40 ? `${raw.slice(0, 40)}…` : raw}]`;
        });
        details.push(`${f.label}: ${shown.join(' ≠ ')}`);
      }
    }
    if (details.length > 0) out.push({ slug, details });
  }
  return out;
}

/** Resolve a slug conflict by assigning each member unit a final slug. */
const resolveSlugConflict = os
  .input(z.strictObject({
    reviewId:    z.string(),
    assignments: z.array(z.strictObject({
      unit: z.string(),
      slug: z.string().min(1),
    })).min(1),
    // Content-source unit per slug, required when the merged members disagree.
    canonical: z.array(z.strictObject({
      slug: z.string(),
      unit: z.string(),
    })).optional(),
  }))
  .output(z.void())
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const review = await db.select().from(ProjectionReview)
      .where(and(eq(ProjectionReview.id, input.reviewId), eq(ProjectionReview.kind, 'slug_conflict')))
      .then(rows => rows[0]);
    if (review == null) throw new ORPCError('BAD_REQUEST', { message: 'slug conflict review not found' });

    const baseSlug = (review.subject as { slug?: string }).slug ?? '';

    const slugToUnits = new Map<string, string[]>();
    for (const a of input.assignments) {
      const list = slugToUnits.get(a.slug) ?? [];
      if (!list.includes(a.unit)) list.push(a.unit);
      slugToUnits.set(a.slug, list);
    }

    const differing = await inconsistentMergedSlugs(db, slugToUnits);
    const canonicalBySlug = new Map<string, string>((input.canonical ?? []).map(c => [c.slug, c.unit]));
    const missingCanonical = differing.filter(d => {
      const unit = canonicalBySlug.get(d.slug);
      return unit == null || !slugToUnits.get(d.slug)!.includes(unit);
    });
    if (missingCanonical.length > 0) {
      const slugList = missingCanonical.map(d => d.slug).join('、');
      const details = missingCanonical.map(d => `「${d.slug}」${d.details.join(' ｜ ')}`).join(' ； ');
      throw new ORPCError('BAD_REQUEST', {
        message: `以下目标 slug 的成员卡牌数据不一致，合并时必须指定以哪个成员为准（canonical）：${slugList} ｜ 详情：${details}`,
      });
    }

    const upsert = async (slug: string, unitIds: string[], resolvedTo: string[]) => {
      const canonicalUnit = canonicalBySlug.get(slug) ?? null;
      await db.insert(CardSlugResolution)
        .values({ slug, unitIds, canonicalUnit, resolvedTo })
        .onConflictDoUpdate({
          target: CardSlugResolution.slug,
          set:    { unitIds, canonicalUnit, resolvedTo },
        });
    };

    const targets = [...slugToUnits.keys()];
    for (const [slug, unitIds] of slugToUnits) {
      await upsert(slug, unitIds, []);
    }
    // If nobody keeps the original collision slug, record it as an empty
    // tombstone row so future units with that natural slug are routed to review.
    if (!targets.includes(baseSlug) && baseSlug !== '') {
      await upsert(baseSlug, [], targets);
    }

    await db.update(ProjectionReview)
      .set({
        status:     'resolved',
        resolution: { mode: 'assign', assignments: input.assignments, canonical: [...canonicalBySlug] },
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
  set:        z.string(),
  number:     z.string(),
});

/**
 * Read-only view of one conflict member (a unit). Accepts either an oracle id
 * or a DFT unit key `oracleId:faceIndex`; DFT faces show the FACE content
 * rather than the double-faced object's joined name/text.
 */
const slugMember = os
  .input(z.strictObject({ unit: z.string() }))
  .output(slugMemberCard)
  .handler(async ({ input }) => {
    const [oracleId, idxStr] = input.unit.split(':');
    const db = getLocalDb();
    const row = await db.select().from(ScryfallCard)
      .where(and(eq(ScryfallCard.lang, 'en'), eq(ScryfallCard.oracleId, oracleId as never)))
      .then(rows => rows[0]);
    if (row == null) throw new Error('member oracle not found');

    const face = unitViewFace({ name: row.name, cardFaces: row.cardFaces as FaceLike[] | null }, idxStr);

    return {
      oracleId:   oracleId!,
      name:       face?.name ?? row.name,
      typeLine:   face?.type_line ?? row.typeLine,
      oracleText: face?.oracle_text ?? row.oracleText,
      manaCost:   face?.mana_cost ?? row.manaCost,
      colors:     face?.colors ?? row.colors,
      power:      face?.power ?? row.power,
      toughness:  face?.toughness ?? row.toughness,
      set:        row.set,
      number:     row.collectorNumber,
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

    const keys = rows
      .filter(r => r.kind === 'slug_conflict')
      .flatMap(row => ((row.payload as { members?: string[] }).members ?? []) as string[]);
    const { names, releases } = await resolveMemberNames(keys);
    const sortMembers = (members: string[]) =>
      [...members].sort((a, b) =>
        (releases.get(a) ?? '9999').localeCompare(releases.get(b) ?? '9999') || a.localeCompare(b),
      );

    type ReviewItemOut = z.infer<typeof reviewItem>;
    const items = rows.map(row => {
      const subject = row.subject as Record<string, unknown>;
      const payload = row.payload as { members?: string[], reason?: string };
      const base: ReviewItemOut = { id: row.id, kind: row.kind, subject, payload };
      if (row.kind === 'slug_conflict') {
        base.slug = (subject.slug as string | undefined);
        base.reason = payload.reason;
        base.members = sortMembers(payload.members ?? []).map(key => ({ key, name: names.get(key) ?? null }));
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
