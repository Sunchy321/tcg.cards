/**
 * Consistency report between mtgch_zhs_card translations and the Scryfall
 * printed surface of the same print. Rows are matched per card through the
 * mtgch_scryfall_card skeleton: its scryfall_id points at the (usually
 * English) Scryfall card object of the same print position, and the Chinese
 * surface is resolved as the lang='zhs' Scryfall row at the same
 * (set, collector number) — preferring the skeleton row itself when it is
 * already the zhs object. Face-split rows compare zhs_card.face_name against
 * card_faces[face_index].printed_* via the skeleton face index.
 *
 * Each of the three printed fields (name / type line / text) is classified:
 *   完全相同 / 细微差异(归一化后相同或相似度≥0.85) / 差异较大 /
 *   mtgch只有英文 / scryfall只有英文 / scryfall缺printed值 /
 *   scryfall无中文行 / 骨架缺失 / mtgch缺失
 *
 * Usage: bun run scripts/magic/mtgch-scryfall-compare.ts [set ...] [--samples=N]
 *   Optional set codes (any case) restrict the report; DATABASE_URL overrides
 *   the local dev database.
 */
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/local');

const setFilter = process.argv.slice(2).filter(arg => !arg.startsWith('--')).map(s => s.toLowerCase());
const samplesWanted = Number(process.argv.find(arg => arg.startsWith('--samples='))?.slice(10) ?? 3);

interface ZhsCardRow {
  cardId:    string;
  name:      string | null;
  faceName:  string | null;
  typeLine:  string | null;
  text:      string | null;
  source:    string | null;
}

interface SkeletonRow {
  cardId:          string;
  scryfallId:      string | null;
  faceIndex:       number | null;
  setCode:         string | null;
  collectorNumber: string | null;
  lang:            string | null;
  name:            string | null;
}

interface ScryfallSide {
  lang:       string;
  name:       string | null;
  type:       string | null;
  text:       string | null;
}

const categories = [
  '完全相同', '细微差异', '差异较大',
  'mtgch只有英文', 'scryfall只有英文',
  'scryfall缺printed值', 'scryfall无中文行', '骨架缺失', 'mtgch缺失',
] as const;
type Category = typeof categories[number];

const ratioThreshold = 0.85;
const cjk = /[\u4e00-\u9fff]/;

/**
 * Normalize a value for fuzzy comparison: mtgch newline escapes, width,
 * punctuation, whitespace, and face-separator spacing (`生物 ～人类`,
 * `生物 — 人类` and `生物～人类` all reduce to the same form).
 */
function norm(value: string): string {
  return value
    .replace(/\\\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/[\s\u3000]+/g, ' ')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[，]/g, ',').replace(/[。]/g, '.').replace(/[：]/g, ':').replace(/[；]/g, ';')
    .replace(/[！]/g, '!').replace(/[？]/g, '?').replace(/[（]/g, '(').replace(/[）]/g, ')')
    .replace(/[／]/g, '/').replace(/[～]/g, '~').replace(/[＋]/g, '+')
    .replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[—–−―～~－]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .toLowerCase()
    .trim();
}

/** Levenshtein distance between two strings. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Uint32Array(b.length + 1);
  let cur = new Uint32Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length]!;
}

/** Similarity ratio in [0,1]; length gap alone can already fall below the threshold. */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  if (Math.abs(a.length - b.length) / maxLen > 1 - ratioThreshold) return 0;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Classify one mtgch value against the Scryfall printed value of the same
 * field; `scryfall` is null/empty when the zhs row exists but the field is
 * missing on it, and callers pass null with no zhs row at all.
 */
function classify(mtgch: string | null, scryfall: string | null, unmatched: boolean): { category: Category, mtgch: string, scryfall: string } {
  const mtgchValue = mtgch?.trim() ?? '';
  if (mtgchValue === '') return { category: 'mtgch缺失', mtgch: mtgchValue, scryfall: '' };
  if (unmatched) return { category: 'scryfall无中文行', mtgch: mtgchValue, scryfall: '' };
  const scryfallValue = scryfall?.trim() ?? '';
  if (scryfallValue === '') return { category: 'scryfall缺printed值', mtgch: mtgchValue, scryfall: '' };
  if (scryfallValue === mtgchValue) return { category: '完全相同', mtgch: mtgchValue, scryfall: scryfallValue };

  const normalized = norm(mtgchValue);
  const mtgchEnglish = !cjk.test(mtgchValue);
  const scryfallEnglish = !cjk.test(scryfallValue);
  if (mtgchEnglish !== scryfallEnglish) {
    return { category: mtgchEnglish ? 'mtgch只有英文' : 'scryfall只有英文', mtgch: mtgchValue, scryfall: scryfallValue };
  }
  if (normalized === norm(scryfallValue) || similarity(normalized, norm(scryfallValue)) >= ratioThreshold) {
    return { category: '细微差异', mtgch: mtgchValue, scryfall: scryfallValue };
  }
  return { category: '差异较大', mtgch: mtgchValue, scryfall: scryfallValue };
}

// Placeholder rows (no value in any column, regardless of source — MTGso rows
// are empty too, and some NULL-source rows carry full translations) are dropped
// up front; they are untranslated print positions, not data to compare.
const cards: ZhsCardRow[] = await sql`
  SELECT card_id AS "cardId", name, face_name AS "faceName", type_line AS "typeLine", text, source
  FROM magic_data.mtgch_zhs_card
  WHERE deleted_at IS NULL
    AND NOT (coalesce(name,'')='' AND coalesce(face_name,'')='' AND coalesce(type_line,'')=''
             AND coalesce(text,'')='' AND coalesce(flavor_name,'')='' AND coalesce(flavor_text,'')='')
`;
const skeletonFilter = setFilter.length > 0 ? sql`AND lower(k.set_code) IN (${setFilter})` : sql``;
const skeletons: SkeletonRow[] = await sql`
  SELECT k.card_id AS "cardId", k.scryfall_id AS "scryfallId", k.face_index AS "faceIndex",
         k.set_code AS "setCode", k.collector_number AS "collectorNumber", k.lang, k.name
  FROM magic_data.mtgch_scryfall_card k
  WHERE k.deleted_at IS NULL ${skeletonFilter}
`;
const wanted = new Set(skeletons.map(row => row.cardId));
const rows = cards.filter(card => wanted.has(card.cardId));
console.log(`zhs_card rows: ${rows.length}${setFilter.length > 0 ? ` (${setFilter.join(', ')})` : ` of ${cards.length}`}`);

const bySource = new Map<string, number>();
for (const card of rows) bySource.set(card.source ?? '(null)', (bySource.get(card.source ?? '(null)') ?? 0) + 1);
console.log(`sources: ${[...bySource.entries()].map(([source, count]) => `${source}=${count}`).join('  ')}`);

// Resolve both Scryfall candidates per card inside one transaction so the temp
// key table stays on a single pooled connection.
const keys = skeletons
  .filter(row => row.scryfallId != null && row.setCode != null && row.collectorNumber != null)
  .map(row => ({ id: row.cardId, sid: row.scryfallId!, set: row.setCode!.toLowerCase(), number: row.collectorNumber!, face: row.faceIndex ?? -1 }));

interface SideRow { cardId: string, lang: string, name: string | null, type: string | null, text: string | null }
const bySid = new Map<string, ScryfallSide>();
const byPosition = new Map<string, ScryfallSide>();

await sql.begin(async tx => {
  await tx`CREATE TEMP TABLE compare_keys(id text, sid uuid, set text, number text, face int) ON COMMIT DROP`;
  for (let i = 0; i < keys.length; i += 20000) {
    await tx`INSERT INTO compare_keys SELECT * FROM jsonb_to_recordset(${sql.json(keys.slice(i, i + 20000))}) AS x(id text, sid uuid, set text, number text, face int)`;
  }
  // The face-aware printed extraction: face rows read card_faces[face], whole cards the top level.
  const faceField = (column: string) => `
    CASE WHEN k.face >= 0 THEN s.card_faces -> k.face ->> '${column}' ELSE s."${column}" END`;

  const sideA: SideRow[] = await tx.unsafe(`
    SELECT k.id AS "cardId", s.lang, ${faceField('printed_name')} AS name, ${faceField('printed_type_line')} AS type, ${faceField('printed_text')} AS text
    FROM compare_keys k JOIN magic_data.scryfall_cards s ON s.card_id = k.sid AND s.deleted_at IS NULL`);
  for (const row of sideA) bySid.set(row.cardId, { lang: row.lang, name: row.name, type: row.type, text: row.text });

  const sideB: SideRow[] = await tx.unsafe(`
    SELECT DISTINCT ON (k.id) k.id AS "cardId", s.lang, ${faceField('printed_name')} AS name, ${faceField('printed_type_line')} AS type, ${faceField('printed_text')} AS text
    FROM compare_keys k JOIN magic_data.scryfall_cards s ON lower(s.set) = k.set AND s.collector_number = k.number AND s.deleted_at IS NULL
    ORDER BY k.id, (s.lang = 'zhs') DESC, (s.lang = 'en') DESC`);
  for (const row of sideB) byPosition.set(row.cardId, { lang: row.lang, name: row.name, type: row.type, text: row.text });
});

interface FieldStat {
  label: string;
  pick: (card: ZhsCardRow, skel: SkeletonRow, side: ScryfallSide | null) => { category: Category, mtgch: string, scryfall: string };
  counts: Record<Category, number>;
  samples: Partial<Record<Category, { where: string, mtgch: string, scryfall: string }[]>>;
}

/** Resolve the Chinese print surface: the zhs row at (set, number), else the skeleton row when it is itself zhs. */
function zhsSurface(skel: SkeletonRow): ScryfallSide | null {
  const positional = byPosition.get(skel.cardId);
  if (positional?.lang === 'zhs') return positional;
  const direct = bySid.get(skel.cardId);
  return direct?.lang === 'zhs' ? direct : null;
}

const isFace = (skel: SkeletonRow) => skel.faceIndex != null && skel.faceIndex >= 0;

const fields: FieldStat[] = [
  {
    label: '名称',
    pick: (card, skel, side) => classify(isFace(skel) ? card.faceName : card.name, side?.name ?? null, side == null),
    counts: emptyCounts(),
    samples: {},
  },
  {
    label: '类别行',
    pick: (card, _skel, side) => classify(card.typeLine, side?.type ?? null, side == null),
    counts: emptyCounts(),
    samples: {},
  },
  {
    label: '规则文字',
    pick: (card, _skel, side) => classify(card.text, side?.text ?? null, side == null),
    counts: emptyCounts(),
    samples: {},
  },
];

function emptyCounts(): Record<Category, number> {
  return Object.fromEntries(categories.map(c => [c, 0])) as Record<Category, number>;
}

const skeletonById = new Map(skeletons.map(row => [row.cardId, row]));
for (const card of rows) {
  const skel = skeletonById.get(card.cardId);
  if (skel == null) {
    for (const field of fields) field.counts['骨架缺失']! += 1;
    continue;
  }
  const side = zhsSurface(skel);
  const lang = side?.lang ?? skel.lang ?? '?';
  const where = `${card.cardId}  set=${skel.setCode} number=${skel.collectorNumber}${isFace(skel) ? ` face=${skel.faceIndex}` : ''} lang=${lang}  ${skel.name}`;
  for (const field of fields) {
    const result = field.pick(card, skel, side);
    field.counts[result.category]! += 1;
    const bucket = field.samples[result.category] ?? (field.samples[result.category] = []);
    if (bucket.length < samplesWanted) bucket.push({ where, mtgch: result.mtgch, scryfall: result.scryfall });
  }
}
for (const field of fields) {
  console.log(`\n=== ${field.label} ===`);
  for (const category of categories) {
    const count = field.counts[category]!;
    if (count === 0) continue;
    const pct = (count / rows.length * 100).toFixed(1).padStart(5);
    console.log(`  ${category.padEnd(12, '　')} ${String(count).padStart(6)}  ${pct}%`);
    for (const sample of field.samples[category] ?? []) {
      const scry = sample.scryfall === '' ? '' : `\n        scryfall=${truncate(sample.scryfall)}`;
      console.log(`      ${sample.where}\n        mtgch=${truncate(sample.mtgch)}${scry}`);
    }
  }
}

function truncate(value: string, max = 40): string {
  const one = value.replaceAll('\n', ' ');
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

await sql.end();
