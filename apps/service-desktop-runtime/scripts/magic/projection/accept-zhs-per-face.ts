/**
 * Deeper acceptance pass for the MTGCH zhs print surfaces: per-face (split /
 * reversible) agreement, type line and rules text, plus the image columns the
 * re-projection had to preserve.
 *
 * Both sides are read in full and compared in memory: a database join on
 * (set, collector number) has no usable index and would scan the whole print
 * table per side.
 */
import postgres from 'postgres';

import { normalizeMtgchText } from '../../../src/lib/magic/project/assemble';
import { purifyText } from '../../../src/lib/magic/project/project-card';

const sql = postgres(process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/local');
let failures = 0;
const check = (label: string, ok: boolean, detail: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  ${detail}`);
  if (!ok) failures++;
};

interface MtgchPosition { name: string | null, typeLine: string | null, text: string | null }
/** Skeleton positions keyed `set|number|faceIndex`. */
const mtgchPositions = new Map<string, MtgchPosition>();
for (const row of await sql`
  SELECT k.set_code, k.collector_number, k.face_index,
         coalesce(nullif(trim(z.face_name), ''), z.name) AS name, z.type_line AS type_line, z.text AS text
  FROM magic_data.mtgch_scryfall_card k
  JOIN magic_data.mtgch_zhs_card z ON z.card_id = k.card_id AND z.deleted_at IS NULL
  WHERE k.deleted_at IS NULL AND k.set_code IS NOT NULL AND k.collector_number IS NOT NULL`) {
  mtgchPositions.set(
    `${(row.set_code as string).toLowerCase()}|${row.collector_number}|${row.face_index ?? -1}`,
    { name: row.name, typeLine: row.type_line, text: row.text },
  );
}
console.log(`mtgch 印刷位: ${mtgchPositions.size}`);

const prints = await sql`
  SELECT set, number, print_name, print_typeline FROM magic.prints WHERE deleted_at IS NULL AND lang = 'zhs'`;
const parts = await sql`
  SELECT set, number, part_index, print_part_name, print_part_typeline, print_part_text
  FROM magic.print_parts WHERE deleted_at IS NULL AND lang = 'zhs'`;
console.log(`zhs print 行: ${prints.length} | print_part 行: ${parts.length}`);

// --- 1. whole-card prints (skeleton face -1) ---
let nameBad = 0, typeBad = 0, textBad = 0, wholeCompared = 0;
for (const print of prints) {
  const src = mtgchPositions.get(`${print.set}|${print.number}|-1`);
  if (src == null) continue;
  const name = normalizeMtgchText(src.name);
  const typeLine = normalizeMtgchText(src.typeLine);
  const text = src.text != null ? purifyText(normalizeMtgchText(src.text) ?? '') : null;
  if (name == null && typeLine == null && text == null) continue;
  wholeCompared++;
  if (name != null && print.print_name !== name) {
    nameBad++;
    if (nameBad <= 5) console.log(`      名称 ${print.set}/${print.number}: 库=${print.print_name} 源=${name}`);
  }
  if (typeLine != null && print.print_typeline !== typeLine) {
    typeBad++;
    if (typeBad <= 5) console.log(`      类别 ${print.set}/${print.number}: 库=${print.print_typeline} 源=${typeLine}`);
  }
  if (text != null) {
    const part = parts.find(p => p.set === print.set && p.number === print.number && p.part_index === 0);
    if (part != null && purifyText(String(part.print_part_text)) !== text) {
      textBad++;
      if (textBad <= 5) console.log(`      文字 ${print.set}/${print.number}: 库=${String(part.print_part_text).slice(0, 40)} 源=${text.slice(0, 40)}`);
    }
  }
}
check('整卡 print_name = mtgch', nameBad === 0, `${wholeCompared} 行比对,不一致 ${nameBad}`);
check('整卡 print_typeline = mtgch', typeBad === 0, `不一致 ${typeBad}`);
check('整卡 part 文字 = mtgch', textBad === 0, `不一致 ${textBad}`);

// --- 2. face-split prints (skeleton face >= 0) ---
let faceNameBad = 0, faceTypeBad = 0, faceCompared = 0;
for (const part of parts) {
  const src = mtgchPositions.get(`${part.set}|${part.number}|${part.part_index}`);
  if (src == null) continue;
  const name = normalizeMtgchText(src.name);
  const typeLine = normalizeMtgchText(src.typeLine);
  if (name == null && typeLine == null) continue;
  faceCompared++;
  if (name != null && part.print_part_name !== name) {
    faceNameBad++;
    if (faceNameBad <= 5) console.log(`      面名称 ${part.set}/${part.number}#${part.part_index}: 库=${part.print_part_name} 源=${name}`);
  }
  if (typeLine != null && part.print_part_typeline !== typeLine) {
    faceTypeBad++;
    if (faceTypeBad <= 6) console.log(`      面类别 ${part.set}/${part.number}#${part.part_index}: 库=${part.print_part_typeline} 源=${typeLine}`);
  }
}
check('逐面 print_part_name = mtgch face_name', faceNameBad === 0, `${faceCompared} 个面比对,不一致 ${faceNameBad}`);
check('逐面 print_part_typeline = mtgch', faceTypeBad === 0, `不一致 ${faceTypeBad}`);

// --- 3. reversible prints carry the referenced card's MTGCH face under the suffixed number ---
const reversible = prints.filter(p => /[0-9][ab]$/.test(p.number));
const revCn = reversible.filter(p => /[一-龥]/.test(p.print_name));
check('reversible 印刷位带上 mtgch 中文', revCn.length > 0, `${reversible.length} 个带后缀印刷位,${revCn.length} 个为中文`);
for (const row of revCn.slice(0, 3)) console.log(`      ${row.set}/${row.number}: ${row.print_name}`);

// --- 4. images survived the re-projection ---
for (const row of await sql`
  SELECT lang, count(*)::int AS rows, count(*) FILTER (WHERE image_info IS NOT NULL)::int AS with_image
  FROM magic.prints WHERE deleted_at IS NULL AND lang IN ('zhs', 'en') GROUP BY lang ORDER BY lang`) {
  console.log(`图片字段 ${row.lang}: ${row.with_image}/${row.rows} 行有 image_info`);
}
const flame = await sql`
  SELECT count(*)::int AS n FROM magic.prints
  WHERE deleted_at IS NULL AND jsonb_path_exists(image_info, '$[*].source ? (@ == "mtgflame")')`;
check('mtgflame 扫图仍在', flame[0]!.n > 0, `${flame[0]!.n} 行挂 mtgflame 图`);

console.log(`\n${failures === 0 ? '全部通过' : `${failures} 项未通过`}`);
await sql.end();
