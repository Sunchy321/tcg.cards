/** Ticket 03 acceptance: verify the projected zhs print surfaces against the MTGCH source. */
import postgres from 'postgres';

import { normalizeMtgchText } from '../../../src/lib/magic/project/assemble';

const sql = postgres(process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/local');
const trad = '[團間學們這個說龍劍寶獸屍萬與風雲靈術師惡體數實變開關門馬鳥來時會對將後從]';
let failures = 0;
const check = (label: string, ok: boolean, detail: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  ${detail}`);
  if (!ok) failures++;
};

// 1. Joined whole-card names must never land in the per-face columns.
const joined = await sql`
  SELECT count(*)::int AS n FROM magic.print_parts
  WHERE deleted_at IS NULL AND (print_part_name LIKE '% // %' OR print_part_typeline LIKE '% // %')`;
check('print_parts 无拼合值', joined[0]!.n === 0, `污染 ${joined[0]!.n} 行(基线 435)`);

// 2. No literal escape residue in any zhs projected text.
const escapes = await sql`
  SELECT count(*)::int AS n FROM magic.prints
  WHERE deleted_at IS NULL AND lang = 'zhs'
    AND (print_name ~ '\\\\[rn]' OR print_typeline ~ '\\\\[rn]')`;
const partEscapes = await sql`
  SELECT count(*)::int AS n FROM magic.print_parts
  WHERE deleted_at IS NULL AND lang = 'zhs'
    AND (print_part_name ~ '\\\\[rn]' OR print_part_text ~ '\\\\[rn]')`;
check('zhs 无字面转义残留', escapes[0]!.n === 0 && partEscapes[0]!.n === 0, `print ${escapes[0]!.n} / part ${partEscapes[0]!.n} 行(基线 128)`);

// 3. Every zhs print whose MTGCH position has a value must carry it.
const mismatch = await sql`
  WITH skel AS (
    SELECT k.set_code, k.collector_number, k.face_index,
           coalesce(nullif(trim(z.face_name), ''), z.name) AS mtgch_name
    FROM magic_data.mtgch_scryfall_card k
    JOIN magic_data.mtgch_zhs_card z ON z.card_id = k.card_id AND z.deleted_at IS NULL
    WHERE k.deleted_at IS NULL AND k.face_index = -1 AND coalesce(nullif(trim(z.face_name), ''), z.name) IS NOT NULL
  )
  SELECT count(*)::int AS n FROM magic.prints p
  JOIN skel s ON lower(s.set_code) = p.set AND s.collector_number = p.number
  WHERE p.deleted_at IS NULL AND p.lang = 'zhs' AND p.print_name <> s.mtgch_name`;
check('zhs print_name 与 mtgch 一致', mismatch[0]!.n === 0, `不一致 ${mismatch[0]!.n} 行`);

// 4. Spot-check the verified real disagreements now sit as MTGCH values.
const spots: [string, string, string][] = [
  ['inv', '12', '圣战骑士'], ['lcc', '9', '辉亮漫游符'], ['ptk', '103', '纵火燎原'],
  ['5ed', '35', '神圣之力'], ['shm', '16', '白土教士'], ['sok', '37', '永铭心间'],
  ['fut', '146', '莫甘达岩画'], ['khm', '322', '英勇判官菲妍'],
];
for (const [set, number, expected] of spots) {
  const rows = await sql`SELECT print_name FROM magic.prints WHERE deleted_at IS NULL AND lang='zhs' AND set=${set} AND number=${number}`;
  const actual = rows[0]?.print_name ?? '(无行)';
  check(`真分歧 ${set}/${number}`, actual === expected, `库内=${actual} 期望=${expected}`);
}

// 5. Old all-English sets must now be Chinese where MTGCH has data.
const coverage = await sql`
  SELECT set,
    count(*)::int AS total,
    count(*) FILTER (WHERE print_name ~ '[一-龥]')::int AS cn
  FROM magic.prints
  WHERE deleted_at IS NULL AND lang = 'zhs'
    AND set IN ('inv','lgn','mrd','ody','ons','ptk','scg','tor','usg','apc','jud','por','5dn')
  GROUP BY set ORDER BY (count(*) FILTER (WHERE print_name ~ '[一-龥]'))::float / count(*)`;
console.log('\nzhs print_name 中文覆盖:');
for (const row of coverage) {
  const pct = ((row.cn / row.total) * 100).toFixed(1);
  console.log(`  ${row.set}  ${row.cn}/${row.total}  ${pct}%`);
}

// 6. No traditional glyphs leaked into the simplified surfaces.
const tradHits = await sql`
  SELECT count(*)::int AS n FROM magic.prints
  WHERE deleted_at IS NULL AND lang = 'zhs' AND (print_name ~ ${trad} OR print_typeline ~ ${trad})`;
check('zhs 无繁体专有字形', tradHits[0]!.n === 0, `${tradHits[0]!.n} 行`);

// 7. The normalizer must clear every escape form present in the source corpus.
const sources = [
  ...await sql`SELECT name AS v FROM magic_data.mtgch_zhs_card WHERE deleted_at IS NULL AND name IS NOT NULL`,
  ...await sql`SELECT face_name AS v FROM magic_data.mtgch_zhs_card WHERE deleted_at IS NULL AND face_name IS NOT NULL`,
  ...await sql`SELECT type_line AS v FROM magic_data.mtgch_zhs_card WHERE deleted_at IS NULL AND type_line IS NOT NULL`,
  ...await sql`SELECT text AS v FROM magic_data.mtgch_zhs_card WHERE deleted_at IS NULL AND text IS NOT NULL`,
  ...await sql`SELECT translated_name AS v FROM magic_data.mtgch_zhs_oracle WHERE deleted_at IS NULL AND translated_name IS NOT NULL`,
  ...await sql`SELECT translated_type AS v FROM magic_data.mtgch_zhs_oracle WHERE deleted_at IS NULL AND translated_type IS NOT NULL`,
  ...await sql`SELECT translated_text AS v FROM magic_data.mtgch_zhs_oracle WHERE deleted_at IS NULL AND translated_text IS NOT NULL`,
];
const residue = sources.filter(row => {
  const out = normalizeMtgchText(row.v as string | null);
  return out != null && /\\[rn]/.test(out);
});
check('归约后 mtgch 全量无转义残留', residue.length === 0, `残留 ${residue.length} 条(共扫 ${sources.length} 条)`);

// 8. Review queue must not have exploded.
const reviews = await sql`
  SELECT kind, status, count(*)::int AS n FROM magic_data.projection_review
  GROUP BY kind, status ORDER BY n DESC`;
console.log('\n投影待审:');
for (const row of reviews) console.log(`  ${row.kind} [${row.status}] ${row.n}`);

console.log(`\n${failures === 0 ? '全部通过' : `${failures} 项未通过`}`);
await sql.end();
