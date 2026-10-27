import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { ORPCError } from '@orpc/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { CardSlugResolution, ProjectionReview, ScryfallCard } from '@tcg-cards/db/schema/local/magic';
import { os } from './index';
import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';
import { listMtgchArchives, listMtgjsonFiles, listScryfallFiles } from '../lib/magic/data-dir';
import { inconsistentMergedSlugs, unitViewFace, type FaceLike } from '../lib/magic/project/consistency';
import { resolvePath } from '../lib/game-paths';
import { magicAmbitRouter } from './magic-ambit';
import { magicCommitsRouter } from './magic-commits';
import { magicRubyRouter } from './magic-ruby';
import { magicSetRouter } from './magic-set';

const magicDataFile = z.strictObject({
  name: z.string(),
  path: z.string(),
});

const magicDataState = z.strictObject({
  dataDir:  z.string().nullable(),
  scryfall: z.array(magicDataFile),
  mtgch:    z.strictObject({ archives: z.array(magicDataFile) }),
  mtgjson:  z.strictObject({ dir: z.string().nullable(), fileCount: z.number() }),
  mtga:     z.strictObject({ dir: z.string().nullable(), cardDatabase: z.boolean() }),
});

/** Reads the configured Magic data directory and its discovered source files. */
const getDataState = os.output(magicDataState).handler(async () => {
  const dataDir = resolvePath('magic.data');
  const scryfallDir = resolvePath('magic.data.scryfall');
  const mtgchDir = resolvePath('magic.data.mtgch');
  const mtgjsonDir = resolvePath('magic.data.mtgjson');
  const mtgjson = mtgjsonDir != null ? listMtgjsonFiles(mtgjsonDir) : { dir: null, fileCount: 0 };
  const mtgaDir = resolvePath('magic.data.mtga');
  return {
    dataDir,
    scryfall: scryfallDir != null ? listScryfallFiles(scryfallDir) : [],
    mtgch:    { archives: mtgchDir != null ? listMtgchArchives(mtgchDir) : [] },
    mtgjson:  { dir: mtgjson.dir, fileCount: mtgjson.fileCount },
    mtga:     { dir: mtgaDir, cardDatabase: mtgaDir != null && existsSync(join(mtgaDir, 'Raw_CardDatabase.mtga')) },
  };
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

/** Resolves localized display names and release dates for projection review units. */
async function resolveMemberNames(keys: string[]): Promise<{ names: Map<string, string>, releases: Map<string, string> }> {
  const names = new Map<string, string>();
  const releases = new Map<string, string>();
  const oracles = [...new Set(keys.map(key => key.split(':')[0]!))].filter(Boolean);
  if (oracles.length === 0) return { names, releases };

  const rows = await getLocalDb().select({
    oracleId:   ScryfallCard.oracleId,
    name:       ScryfallCard.name,
    releasedAt: ScryfallCard.releasedAt,
    cardFaces:  ScryfallCard.cardFaces,
  }).from(ScryfallCard)
    .where(and(eq(ScryfallCard.lang, 'en'), inArray(ScryfallCard.oracleId, oracles as never)));

  const byOracle = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!byOracle.has(String(row.oracleId))) byOracle.set(String(row.oracleId), row);
  }

  for (const key of keys) {
    const [oracleId, faceIndex] = key.split(':');
    const row = byOracle.get(oracleId!);
    if (!row) continue;
    releases.set(key, String(row.releasedAt));
    const face = unitViewFace({ name: row.name, cardFaces: row.cardFaces as FaceLike[] | null }, faceIndex);
    names.set(key, face?.name ?? row.name);
  }
  return { names, releases };
}

function sortedMembers(members: string[], releases: Map<string, string>) {
  return [...members].sort((a, b) =>
    (releases.get(a) ?? '9999').localeCompare(releases.get(b) ?? '9999') || a.localeCompare(b),
  );
}

/** Lists pending slug conflicts from the projection review queue. */
const listSlugConflicts = os.output(z.strictObject({ items: z.array(slugConflictItem) })).handler(async () => {
  const rows = await getLocalDb().select().from(ProjectionReview)
    .where(and(eq(ProjectionReview.kind, 'slug_conflict'), eq(ProjectionReview.status, 'pending')));
  const keys = rows.flatMap(row => ((row.payload as { members?: string[] }).members ?? []) as string[]);
  const { names, releases } = await resolveMemberNames(keys);
  return {
    items: rows.map(row => {
      const subject = row.subject as { slug?: string };
      const payload = row.payload as { members?: string[], reason?: string };
      return {
        id:      row.id,
        slug:    subject.slug ?? '',
        reason:  payload.reason ?? 'conflict',
        members: sortedMembers(payload.members ?? [], releases).map(key => ({ key, name: names.get(key) ?? null })),
      };
    }),
  };
});

/** Assigns projection conflict members to final slugs without changing source identities. */
const resolveSlugConflict = os
  .input(z.strictObject({
    reviewId:    z.string(),
    assignments: z.array(z.strictObject({ unit: z.string(), slug: z.string().min(1) })).min(1),
    canonical:   z.array(z.strictObject({ slug: z.string(), unit: z.string() })).optional(),
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
    for (const assignment of input.assignments) {
      const members = slugToUnits.get(assignment.slug) ?? [];
      if (!members.includes(assignment.unit)) members.push(assignment.unit);
      slugToUnits.set(assignment.slug, members);
    }

    const differing = await inconsistentMergedSlugs(db, slugToUnits);
    const canonicalBySlug = new Map<string, string>((input.canonical ?? []).map(item => [item.slug, item.unit]));
    const missingCanonical = differing.filter(item => {
      const unit = canonicalBySlug.get(item.slug);
      return unit == null || !slugToUnits.get(item.slug)!.includes(unit);
    });
    if (missingCanonical.length > 0) {
      const slugs = missingCanonical.map(item => item.slug).join('、');
      const details = missingCanonical.map(item => `「${item.slug}」${item.details.join(' ｜ ')}`).join(' ； ');
      throw new ORPCError('BAD_REQUEST', {
        message: `以下目标 slug 的成员卡牌数据不一致，合并时必须指定以哪个成员为准（canonical）：${slugs} ｜ 详情：${details}`,
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

    const targetSlugs = [...slugToUnits.keys()];
    for (const [slug, units] of slugToUnits) await upsert(slug, units, []);
    if (!targetSlugs.includes(baseSlug) && baseSlug !== '') await upsert(baseSlug, [], targetSlugs);

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

/** Reads one projection conflict member, showing one face when a unit targets a DFC face. */
const slugMember = os.input(z.strictObject({ unit: z.string() })).output(slugMemberCard).handler(async ({ input }) => {
  const [oracleId, faceIndex] = input.unit.split(':');
  const row = await getLocalDb().select().from(ScryfallCard)
    .where(and(eq(ScryfallCard.lang, 'en'), eq(ScryfallCard.oracleId, oracleId as never)))
    .then(rows => rows[0]);
  if (row == null) throw new Error('member oracle not found');
  const face = unitViewFace({ name: row.name, cardFaces: row.cardFaces as FaceLike[] | null }, faceIndex);
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

/** Lists pending projection reviews for the shared review page. */
const reviewList = os.output(z.strictObject({ items: z.array(reviewItem) })).handler(async () => {
  const rows = await getLocalDb().select().from(ProjectionReview)
    .where(eq(ProjectionReview.status, 'pending'))
    .orderBy(ProjectionReview.kind);
  const keys = rows
    .filter(row => row.kind === 'slug_conflict')
    .flatMap(row => ((row.payload as { members?: string[] }).members ?? []) as string[]);
  const { names, releases } = await resolveMemberNames(keys);
  const items = rows.map(row => {
    const subject = row.subject as Record<string, unknown>;
    const payload = row.payload as { members?: string[], reason?: string };
    const item: z.infer<typeof reviewItem> = { id: row.id, kind: row.kind, subject, payload };
    if (row.kind === 'slug_conflict') {
      item.slug = subject.slug as string | undefined;
      item.reason = payload.reason;
      item.members = sortedMembers(payload.members ?? [], releases).map(key => ({ key, name: names.get(key) ?? null }));
    }
    return item;
  });
  return { items };
});

export const magicRouter = {
  getDataState,
  set:     magicSetRouter,
  ruby:    magicRubyRouter,
  ambit:   magicAmbitRouter,
  commits: magicCommitsRouter,
  slug:    { listConflicts: listSlugConflicts, resolveConflict: resolveSlugConflict, member: slugMember },
  review:  { list: reviewList },
};
