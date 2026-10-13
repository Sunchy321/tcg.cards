#!/usr/bin/env bun

/**
 * Re-project the cards whose Japanese print surfaces carry upstream-flattened
 * furigana glosses (`漢字（かな）` in printed names/type lines), so their
 * `prints` / `print_parts` / `card_localizations` / `card_part_localizations`
 * rows are rewritten with the cleaned surfaces (ticket 02). Uses the exact
 * production path — assemble → projectCard with the reviewed ruby lookup →
 * batch upsert — just scoped to the affected oracles; a full magic-project run
 * reaches the same rows.
 *
 * Usage:
 *   bun run apps/service-desktop-runtime/scripts/magic/name-ruby/repair-polluted.ts
 */

import { and, eq, isNull, sql } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';
import { ScryfallCard } from '@tcg-cards/db/schema/local/magic';
import { CardLocalization, CardPartLocalization } from '@tcg-cards/db/schema/shared/magic/card';
import { Print, PrintPart } from '@tcg-cards/db/schema/shared/magic/print';

import { getLocalDb } from '../../../src/lib/hearthstone/hsdata-local-db';
import { assembleCard } from '../../../src/lib/magic/project/assemble';
import { loadNameRubyLookup } from '../../../src/lib/magic/name-ruby';
import { projectCard } from '../../../src/lib/magic/project/project-card';
import { upsertBatch } from '../../../src/lib/magic/upsert';

const PRINT_PK = ['cardId', 'version', 'set', 'number', 'lang', 'source'];
const CARD_LOC_PK = ['cardId', 'version', 'locale', 'source'];
const CARD_PART_LOC_PK = [...CARD_LOC_PK, 'partIndex'];

const database = getLocalDb();
const lookup = await loadNameRubyLookup(database);

const GLOSS = sql`(${ScryfallCard.printedName} ~ '[（(][ぁ-んァ-ヶーー]*[）)]' OR ${ScryfallCard.printedTypeLine} ~ '[（(][ぁ-んァ-ヶーー]*[）)]' OR ${ScryfallCard.cardFaces}::text ~ '[（(][ぁ-んァ-ヶーー]*[）)]')`;
const oracles = (await database.selectDistinct({ oracleId: ScryfallCard.oracleId })
  .from(ScryfallCard)
  .where(and(eq(ScryfallCard.lang, 'ja'), isNull(ScryfallCard.deletedAt), GLOSS)))
  .map(r => r.oracleId);

console.log(`oracles with polluted ja surfaces: ${oracles.length}`);

let done = 0;
for (const oracleId of oracles) {
  const assembled = await assembleCard(database, oracleId);
  const result = projectCard(assembled, lookup);
  await upsertBatch(database, Print, result.prints, PRINT_PK.map(k => (Print as any)[k]), PRINT_PK);
  await upsertBatch(database, PrintPart, result.printParts, [...PRINT_PK, 'partIndex'].map(k => (PrintPart as any)[k]), [...PRINT_PK, 'partIndex']);
  await upsertBatch(database, CardLocalization, result.cardLocalizations, CARD_LOC_PK.map(k => (CardLocalization as any)[k]), CARD_LOC_PK);
  await upsertBatch(database, CardPartLocalization, result.cardPartLocalizations, CARD_PART_LOC_PK.map(k => (CardPartLocalization as any)[k]), CARD_PART_LOC_PK);
  done++;
  if (done % 50 === 0) console.log(`  ${done}/${oracles.length}`);
}

console.log(`re-projected: ${done}`);
process.exit(0);
