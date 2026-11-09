/**
 * Probe Scryfall all-cards bulk data: does one oracle_id produce multiple
 * resource_ids (one per print card object)? And does the oracle-level card
 * itself carry a resource_id?
 *
 * Usage: bun run scripts/magic/probe-resource-id.ts [--limit N]
 */
import { createGunzip } from 'node:zlib';
import { createReadStream, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dataDir = '/Users/sunchy321/Desktop/WebServer/data/magic/scryfall';
const c = readdirSync(dataDir).filter(f => f.startsWith('all-cards') && f.endsWith('.jsonl.gz')).sort();
const file = join(dataDir, c[c.length - 1]);
const limit = Number(process.argv[process.argv.indexOf('--limit') + 1] ?? 300);

// oracle_id -> { resourceIds: Set, prints: count, enResourceIds: Set }
const byOracle = new Map<string, { resourceIds: Set<string>; prints: number; enResourceIds: Set<string> }>();
let tail = Buffer.alloc(0);
let cards = 0;
const stream = createReadStream(file, { highWaterMark: 4 * 1024 * 1024 }).pipe(createGunzip());
for await (const chunk of stream) {
  tail = Buffer.concat([tail, chunk]);
  let i;
  while ((i = tail.indexOf(0x0a)) !== -1) {
    const lineBuf = tail.subarray(0, i);
    tail = tail.subarray(i + 1);
    let o: any;
    try { o = JSON.parse(lineBuf.toString('utf8')); } catch { continue; }
    if (o.object !== 'card' || !o.oracle_id) continue;
    cards++;
    let e = byOracle.get(o.oracle_id);
    if (!e) { if (byOracle.size >= limit && !o.resource_id) continue; e = { resourceIds: new Set(), prints: 0, enResourceIds: new Set() }; byOracle.set(o.oracle_id, e); }
    e.prints++;
    if (o.resource_id) e.resourceIds.add(o.resource_id);
    if (o.lang === 'en' && o.resource_id) e.enResourceIds.add(o.resource_id);
    if (byOracle.size >= limit && [...byOracle.values()].every(x => x.prints > 0 && x.resourceIds.size > 0)) { /* keep going until all have resource ids */ }
  }
  if (cards > 200000) break;
}

console.log(`scanned ${cards} cards, ${byOracle.size} oracle_ids sampled\n`);
const dist = new Map<number, number>();
for (const e of byOracle.values()) {
  const n = e.resourceIds.size;
  dist.set(n, (dist.get(n) ?? 0) + 1);
}
console.log('resource_id count per oracle_id (distinct resource ids across all prints):');
for (const [n, cnt] of [...dist.entries()].sort((a, b) => a[0] - b[0])) console.log(`  ${n} resource_id(s): ${cnt} oracle_ids`);

console.log('\nexamples:');
let shown = 0;
for (const [oracleId, e] of byOracle) {
  if (shown >= 5) break;
  if (e.resourceIds.size >= 2) {
    console.log(`  oracle ${oracleId}: ${e.prints} prints, ${e.resourceIds.size} distinct resource_ids, EN: ${[...e.enResourceIds].length}`);
    console.log(`    resource_ids: ${[...e.resourceIds].join(', ')}`);
    shown++;
  }
}
if (shown === 0) console.log('  (no oracle_id with multiple resource_ids found)');
