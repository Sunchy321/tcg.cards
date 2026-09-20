/**
 * Report mtgflame scan import status per set: sets whose zhs prints carry
 * mtgflame images (imported, with coverage), sets with prints but no mtgflame
 * images yet (not imported), and sets with no zhs prints at all (missing
 * prints). For partially imported sets, lists the print numbers still without
 * a mtgflame image.
 *
 * Usage: bun run scripts/magic/flame-set-status.ts [set ...]
 *   Set codes default to the current mtgflame archive list.
 *   DATABASE_URL overrides the local dev database.
 */
import postgres from 'postgres';

const defaultSets = [
  '5dn', '5ed', '6ed', '7ed', '8ed', '9ed', 'apc', 'bok', 'chk', 'csp',
  'dis', 'dst', 'fut', 'gpt', 'inv', 'jud', 'lgn', 'mrd', 'ody', 'ons',
  'plc', 'pls', 'por', 'ptk', 'rav', 'scg', 'sok', 'tor', 'tsp', 'usg',
];
const sets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultSets;

const sql = postgres(process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/local');

// mtgflame scans are Chinese scans and only ever attach to zhs print rows.
const flame = sql`coalesce(jsonb_path_exists(image_info, '$[*].source ? (@ == "mtgflame")'), false)`;

const summary = await sql`
  SELECT set,
    count(*) AS zhs,
    count(*) FILTER (WHERE ${flame}) AS flame,
    count(*) FILTER (WHERE image_info IS NOT NULL AND NOT ${flame}) AS other_src
  FROM magic.prints
  WHERE deleted_at IS NULL AND lang = 'zhs' AND set = ANY(${sets})
  GROUP BY set
`;

const bySet = new Map(summary.map(row => [row.set, row]));
const imported: typeof summary = [];
const pending: string[] = [];
const noPrints: string[] = [];

for (const set of sets) {
  const row = bySet.get(set);
  if (!row || Number(row.zhs) === 0) noPrints.push(set);
  else if (Number(row.flame) > 0) imported.push(row);
  else pending.push(set);
}

const partial = imported.filter(row => Number(row.flame) < Number(row.zhs)).map(row => row.set);
const detail = partial.length > 0
  ? await sql`
      SELECT set, number, image_info IS NULL AS no_img
      FROM magic.prints
      WHERE deleted_at IS NULL AND lang = 'zhs' AND set = ANY(${partial}) AND NOT ${flame}
      ORDER BY set, number
    `
  : [];

const missing = new Map<string, { none: string[]; other: string[] }>();
for (const row of detail) {
  const entry = missing.get(row.set) ?? { none: [], other: [] };
  (row.no_img ? entry.none : entry.other).push(row.number);
  missing.set(row.set, entry);
}

console.log(`✅ 已导入 ${imported.length} 个:`);
for (const row of imported.sort((a, b) => a.set.localeCompare(b.set))) {
  const zhs = Number(row.zhs), flame = Number(row.flame);
  const line = `  ${row.set}  ${flame}/${zhs}${flame === zhs ? ' 满' : ''}`;
  const gap = missing.get(row.set);
  if (!gap) { console.log(line); continue; }
  const parts: string[] = [];
  if (gap.none.length > 0) parts.push(`无图 ${gap.none.length}: ${gap.none.join(' ')}`);
  if (gap.other.length > 0) parts.push(`其他来源 ${gap.other.length}: ${gap.other.join(' ')}`);
  console.log(`${line}，差 ${zhs - flame}（${parts.join('；')}）`);
}
console.log(`\n⬜ 未导入 ${pending.length} 个: ${pending.join(' ') || '无'}`);
console.log(`\n✖ 缺 zhs print ${noPrints.length} 个: ${noPrints.join(' ') || '无'}`);

await sql.end();
