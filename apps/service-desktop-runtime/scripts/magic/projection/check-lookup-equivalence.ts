/**
 * Equivalence check for the MTGCH print-map lookup: the oracle-keyed query
 * (current) must return the same per-position data the set/number cross-product
 * query (previous) returned, for every position a card actually prints at.
 */
import { createDb } from '@tcg-cards/db';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { MtgchScryfallCard, MtgchZhsCard, ScryfallCard } from '@tcg-cards/db/schema/local/magic';
import { loadMtgchPrintMap } from '../../../src/lib/magic/project/assemble';

const db = createDb(process.env.DESKTOP_LOCAL_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/local');

interface Entry { faceIndex: number | null, faceName: string | null, name: string | null, typeLine: string | null, text: string | null }
type Map = globalThis.Map<string, Entry[]>;

/** The previous lookup shape: set/number cross product over the card's own positions. */
async function loadBySetNumber(positions: { set: string, number: string }[]): Promise<Map> {
  const sets = [...new Set(positions.map(p => p.set.toLowerCase()))];
  const numbers = [...new Set(positions.map(p => p.number))];
  const rows = await db
    .select({
      setCode:         MtgchScryfallCard.setCode,
      collectorNumber: MtgchScryfallCard.collectorNumber,
      faceIndex:       MtgchScryfallCard.faceIndex,
      faceName:        MtgchZhsCard.faceName,
      name:            MtgchZhsCard.name,
      typeLine:        MtgchZhsCard.typeLine,
      text:            MtgchZhsCard.text,
    })
    .from(MtgchScryfallCard)
    .innerJoin(MtgchZhsCard, eq(MtgchZhsCard.cardId, MtgchScryfallCard.cardId))
    .where(and(
      isNull(MtgchScryfallCard.deletedAt), isNull(MtgchZhsCard.deletedAt),
      inArray(sql`lower(${MtgchScryfallCard.setCode})`, sets), inArray(MtgchScryfallCard.collectorNumber, numbers),
    ));
  const map: Map = new globalThis.Map();
  for (const row of rows) {
    if (row.setCode == null || row.collectorNumber == null) continue;
    const key = `${row.setCode.toLowerCase()}|${row.collectorNumber}`;
    const list = map.get(key);
    const entry: Entry = { faceIndex: row.faceIndex, faceName: row.faceName, name: row.name, typeLine: row.typeLine, text: row.text };
    if (list == null) {
      map.set(key, [entry]);
    } else {
      list.push(entry);
    }
  }
  return map;
}

const sortEntries = (list: Entry[] | undefined) => (list ?? []).map(e => JSON.stringify(e)).sort();

let checked = 0;
let mismatches = 0;
let oldOnly = 0;
let newOnly = 0;

for (let round = 0; round < 6; round++) {
  const sample = await db
    .select({ oracleId: ScryfallCard.oracleId, set: ScryfallCard.set, number: ScryfallCard.collectorNumber })
    .from(ScryfallCard)
    .where(and(eq(ScryfallCard.lang, 'en'), sql`${ScryfallCard.oracleId} is not null`))
    .orderBy(sql`random()`)
    .limit(100);

  for (const row of sample) {
    const oracleId = row.oracleId!;
    const positions = await db
      .select({ set: ScryfallCard.set, number: ScryfallCard.collectorNumber })
      .from(ScryfallCard)
      .where(eq(ScryfallCard.oracleId, oracleId));
    const keys = [...new Set(positions.map(p => `${p.set.toLowerCase()}|${p.number}`))];

    const oldMap = await loadBySetNumber(positions);
    const newMap = await loadMtgchPrintMap(db, [oracleId]);
    checked++;

    for (const key of keys) {
      const a = sortEntries(oldMap.get(key));
      const b = sortEntries(newMap.get(key));
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        mismatches++;
        if (b.length > a.length) newOnly++;
        if (a.length > b.length) oldOnly++;
        if (mismatches <= 5) console.log(`MISMATCH oracle=${oracleId} key=${key}\n  old=${JSON.stringify(a)}\n  new=${JSON.stringify(b)}`);
      }
    }
    // Positions the new lookup adds beyond the card's own (reversible contributions).
    const extra = [...newMap.keys()].filter(k => !keys.includes(k));
    if (extra.length > 0 && newOnly <= 5) console.log(`EXTRA oracle=${oracleId} (not in own positions, likely reversible): ${extra.join(', ')}`);
  }
}

console.log(`\nchecked ${checked} oracles | mismatching keys: ${mismatches} (new-only: ${newOnly}, old-only: ${oldOnly})`);
await db.$client.end({ timeout: 1 }).catch(() => undefined);
