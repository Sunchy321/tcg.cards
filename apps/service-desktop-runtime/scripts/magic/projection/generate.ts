#!/usr/bin/env bun

/**
 * Regenerate the golden projection fixture + test for one oracle card.
 *
 * Usage:
 *   bun run apps/service-desktop-runtime/scripts/magic/projection/generate.ts \
 *     --name "Lightning Bolt"
 *   # or
 *   ... --oracle <uuid>
 *
 * Reads the card's raw rows from magic_data (assemble.ts), runs the pure
 * projectCard, and writes:
 *   src/lib/magic/project/cards/<cardId>/input.json     — AssembledCard input
 *   src/lib/magic/project/cards/<cardId>/expected.json  — ProjectCardResult output
 *   src/lib/magic/project/cards/<cardId>/<cardId>.test.ts
 *
 * Fixtures are source data: never hand-tune them. Regenerate, then review diff.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';
import { ScryfallCard } from '@tcg-cards/db/schema/local/magic';

import { assembleUnits } from '../../../src/lib/magic/project/assemble';
import { projectCard, type AssembledCard, type ProjectCardResult } from '../../../src/lib/magic/project/project-card';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const nameArg = flag('name');
const oracleArg = flag('oracle');
/** Projection language for the fixture: keep only this language's newest print. */
const lang = flag('lang') ?? 'en';
/** Keep up to this many newest prints of that language (default 1). */
const maxPrints = Number(flag('max') ?? '1');
/** Write only this unit index (e.g. one face of a double_faced_token). */
const unitIndex = flag('unit') != null ? Number(flag('unit')) : undefined;
/** Kebab-case reason suffix appended to the fixture folder name. */
const reason = flag('reason');

if (!nameArg && !oracleArg) {
  console.error('Provide --name "Card Name" or --oracle <uuid>.');
  process.exit(1);
}

const url = process.env.DESKTOP_LOCAL_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/local';
const db = createDb(url);

let oracle = oracleArg;
if (!oracle && nameArg) {
  const rows = await db.select({ oracleId: ScryfallCard.oracleId })
    .from(ScryfallCard)
    .where(eq(ScryfallCard.name, nameArg))
    .limit(1);
  oracle = rows[0]?.oracleId ?? undefined;
  if (!oracle) {
    console.error(`No English card named "${nameArg}".`);
    process.exit(1);
  }
}

function minimize(assembled: AssembledCard): AssembledCard {
  // Keep the golden fixture minimal: project only the newest print of one
  // language, and only that language's official localization surface. These
  // tests verify the projection flow is correct, not exhaustive over data, so a
  // single version is enough. `zhs` additionally keeps the mtgch folk surface to
  // exercise the folk-overrides-official path.
  assembled.prints = (assembled.prints ?? [])
    .filter(p => p.lang === lang)
    .sort((a, b) => (a.releasedAt < b.releasedAt ? 1 : -1))
    .slice(0, Math.max(1, maxPrints));
  if (lang === 'en') {
    assembled.localizations = [];
    assembled.mtgch = null;
  } else {
    assembled.localizations = (assembled.localizations ?? []).filter(s => s.locale === lang && s.source === '');
    if (lang !== 'zhs') assembled.mtgch = null;
  }
  return assembled;
}

const testsDir = join(import.meta.dir, '../../../src/lib/magic/project/tests');
const units = await assembleUnits(db, oracle!);
const selected = unitIndex != null ? units.slice(unitIndex, unitIndex + 1) : units;
let wrote = 0;
for (const assembled of selected) {
  minimize(assembled);
  const result: ProjectCardResult = projectCard(assembled);

  const cardId = assembled.cardId;
  // Folder name = card name, suffixed with the reason this fixture exists.
  const slug = reason ? `${cardId}--${reason}` : cardId;
  const dir = join(testsDir, slug);
  mkdirSync(dir, { recursive: true });

  writeFileSync(join(dir, 'input.json'), `${JSON.stringify(assembled, null, 2)}\n`);
  writeFileSync(join(dir, 'expected.json'), `${JSON.stringify(result, null, 2)}\n`);

  const testSource = `import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from 'bun:test';
import { projectCard, type AssembledCard, type ProjectCardResult } from '../../project-card';

const dir = import.meta.dir;
const input = JSON.parse(readFileSync(join(dir, 'input.json'), 'utf8')) as AssembledCard;
const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8')) as ProjectCardResult;

test('projection golden: ${slug}', () => {
  expect(projectCard(input)).toEqual(expected);
});
`;

  writeFileSync(join(dir, `${slug}.test.ts`), testSource);

  console.log(`wrote ${slug}`);
  console.log(`  cards:  ${result.cards.length}`);
  console.log(`  parts:  ${result.cardParts.length}`);
  console.log(`  locs:   ${result.cardLocalizations.length}`);
  console.log(`  partLocs: ${result.cardPartLocalizations.length}`);
  console.log(`  prints: ${result.prints.length}`);
  console.log(`  printParts: ${result.printParts.length}`);
  console.log(`  unified: ${result.unified.length}`);
  console.log(`  reviews: ${result.reviews.length}`);
  console.log(`dir: ${dir}`);
  wrote++;
}
console.log(`wrote ${wrote} unit fixture(s)`);

await db.$client.end({ timeout: 1 }).catch(() => undefined);
