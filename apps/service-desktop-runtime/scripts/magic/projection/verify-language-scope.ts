/** Verify the joined-value split and the mtgch takeover on real data, per language. */
import { createDb } from '@tcg-cards/db';
import { eq, and } from 'drizzle-orm';
import { ScryfallCard } from '@tcg-cards/db/schema/local/magic';
import { assembleUnits } from '../../../src/lib/magic/project/assemble';
import { projectCard } from '../../../src/lib/magic/project/project-card';

const db = createDb(process.env.DESKTOP_LOCAL_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/local');

async function report(set: string, number: string, enLang = 'en') {
  const rows = await db.select({ oracleId: ScryfallCard.oracleId, name: ScryfallCard.name })
    .from(ScryfallCard)
    .where(and(eq(ScryfallCard.lang, enLang), eq(ScryfallCard.set, set), eq(ScryfallCard.collectorNumber, number)))
    .limit(1);
  const oracle = rows[0]?.oracleId;
  if (!oracle) {
    console.log(`${set}/${number}: no English oracle row`);
    return;
  }
  console.log(`\n=== ${set}/${number} (${rows[0]!.name}) oracle=${oracle} ===`);
  const units = await assembleUnits(db, oracle);
  for (const unit of units) {
    const result = projectCard(unit);
    for (const p of result.prints) {
      if (p.set !== set || p.number !== number) continue;
      const parts = result.printParts
        .filter(pp => pp.set === set && pp.number === number && pp.lang === p.lang)
        .sort((a, b) => (a.partIndex ?? 0) - (b.partIndex ?? 0))
        .map(pp => `${pp.partIndex}:${pp.name}`);
      console.log(`  [${p.lang}] print_name=${p.name} | parts: ${parts.join('  ')}`);
    }
  }
}

// clb/691 'Dusk // Dawn' — scryfall face slot stores the joined name (de/en cases).
await report('clb', '691');
// 5ed/35 'Holy Strength' — zhs mtgch takeover (old set, scryfall printed empty).
await report('5ed', '35');
// inv/12 'Crusading Knight' — zhs mtgch takeover.
await report('inv', '12');
// m3c/61 'Siege-Gang Lieutenant' — zhs falls back to scryfall official Chinese.
await report('m3c', '61');

await db.$client.end({ timeout: 1 }).catch(() => undefined);
