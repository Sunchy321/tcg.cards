import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@tcg-cards/db/db';
import { ScryfallCard } from '@tcg-cards/db/schema/local/magic';

import { isArtBackDoubleFacedToken } from '../match';

type Db = typeof db;

export type FaceLike = {
  name?: string; type_line?: string; oracle_text?: string | null; mana_cost?: string | null;
  colors?: string[] | null; power?: string | null; toughness?: string | null;
};

/**
 * Face content behind a unit key. A bare-oracleId key normally means a
 * whole-card unit whose top-level row fields ARE the card, but an art-back
 * double_faced_token is collapsed by match into a front-face-only unit still
 * keyed by bare oracle id — its view must read face 0, because the top-level
 * fields carry the combined "A // B" data of the art back.
 */
export function unitViewFace(row: { name: string, cardFaces: FaceLike[] | null }, idxStr: string | null | undefined): FaceLike | undefined {
  const faces = row.cardFaces ?? [];
  if (idxStr != null) return faces[Number(idxStr)];
  const artBack = isArtBackDoubleFacedToken(
    faces.map(f => f.name ?? ''),
    faces.map(f => ({ oracleText: f.oracle_text ?? null, power: f.power ?? null, toughness: f.toughness ?? null })),
  );
  return artBack ? faces[0] : undefined;
}

/**
 * Returns merged slugs whose member units disagree on non-localized card data,
 * together with the differing fields/values. Units are compared at FACE level
 * for DFT keys (`oracleId:face`), never the joined double-faced top-level data.
 * Used both by manual conflict resolution (oRPC) and the projection task's
 * card-consistency stage.
 */
export async function inconsistentMergedSlugs(database: Db, groups: Map<string, string[]>): Promise<{ slug: string, details: string[] }[]> {
  const mergedGroups = [...groups.entries()].filter(([, units]) => units.length > 1);
  const out: { slug: string, details: string[] }[] = [];

  const oracles = [...new Set(mergedGroups.flatMap(([, units]) => units.map(u => u.split(':')[0]!)))];
  if (oracles.length === 0) return out;
  const rows = await database.select({
    oracleId:   ScryfallCard.oracleId,
    name:       ScryfallCard.name,
    typeLine:   ScryfallCard.typeLine,
    oracleText: ScryfallCard.oracleText,
    colors:     ScryfallCard.colors,
    power:      ScryfallCard.power,
    toughness:  ScryfallCard.toughness,
    cardFaces:  ScryfallCard.cardFaces,
  }).from(ScryfallCard)
    .where(and(eq(ScryfallCard.lang, 'en'), inArray(ScryfallCard.oracleId, oracles as never)));

  const rowByOracle = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (!rowByOracle.has(String(r.oracleId))) rowByOracle.set(String(r.oracleId), r);
  }

  interface View { name: string, typeLine: string, oracleText: string, colors: string, power: string, toughness: string }

  const viewOf = (unit: string): View | null => {
    const [oid, idxStr] = unit.split(':');
    const row = rowByOracle.get(oid!);
    if (!row) return null;
    const f = unitViewFace({ name: row.name, cardFaces: row.cardFaces as FaceLike[] | null }, idxStr);
    return {
      name:       f?.name ?? row.name,
      typeLine:   (f?.type_line ?? row.typeLine ?? '').replace(/\s+/g, ' ').trim(),
      oracleText: (f?.oracle_text ?? row.oracleText ?? '').replace(/\s+/g, ' ').trim(),
      colors:     [...(f?.colors ?? row.colors ?? [])].sort().join(''),
      power:      (f?.power ?? row.power ?? '').trim(),
      toughness:  (f?.toughness ?? row.toughness ?? '').trim(),
    };
  };

  const fields = [
    { get: (v: View) => v.name, label: '名称' },
    { get: (v: View) => v.typeLine, label: '类别行' },
    { get: (v: View) => v.oracleText, label: '规则文字' },
    { get: (v: View) => v.colors, label: '颜色' },
    { get: (v: View) => v.power, label: '力量' },
    { get: (v: View) => v.toughness, label: '防御' },
  ] as const;

  for (const [slug, units] of mergedGroups) {
    const views = units.map(u => ({ unit: u, view: viewOf(u) }));
    if (views.some(v => v.view == null)) {
      throw new Error(`无法合并「${slug}」：缺少成员数据。`);
    }
    const details: string[] = [];
    for (const f of fields) {
      if (new Set(views.map(v => f.get(v.view!))).size > 1) {
        const shown = views.map(v => {
          const raw = f.get(v.view!);
          return `[${v.view!.name} → ${raw.length > 40 ? `${raw.slice(0, 40)}…` : raw}]`;
        });
        details.push(`${f.label}: ${shown.join(' ≠ ')}`);
      }
    }
    if (details.length > 0) out.push({ slug, details });
  }
  return out;
}
