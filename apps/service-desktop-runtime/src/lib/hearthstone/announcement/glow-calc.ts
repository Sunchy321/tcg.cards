import { sortGlow } from '@tcg-cards/shared/hearthstone/glow';
import type { GlowEntry } from '@tcg-cards/model/hearthstone/schema/announcement';
import type { RenderModel } from '@tcg-cards/model/hearthstone/schema/entity';

/** Compares two values; arrays are treated as order-insensitive sets. */
function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const sa = [...(Array.isArray(a) ? a : [])].sort();
    const sb = [...(Array.isArray(b) ? b : [])].sort();
    return JSON.stringify(sa) === JSON.stringify(sb);
  }
  return a === b;
}

/**
 * Computes the glow entries (highlight markers) between two resolved card render
 * models. `curr` is the newer side, `prev` the older. Null numeric values count as 0.
 * Art is intentionally skipped (not auto-detectable).
 */
export function computeGlowDiff(curr: RenderModel, prev: RenderModel): GlowEntry[] {
  const entries: GlowEntry[] = [];

  const num = (part: GlowEntry['part'], a: number | null | undefined, b: number | null | undefined, invert = false) => {
    const av = a ?? 0;
    const bv = b ?? 0;
    if (av === bv) return;
    const increased = av > bv;
    entries.push({ part, type: invert ? (increased ? 'nerf' : 'buff') : (increased ? 'buff' : 'nerf') });
  };

  const changed = (part: GlowEntry['part'], type: 'rework' | 'neutral', a: unknown, b: unknown) => {
    if (same(a, b)) return;
    entries.push({ part, type });
  };

  // Lower cost / lower tavern tier are improvements; lower stats are nerfs.
  num('cost', curr.cost, prev.cost, true);
  num('tech-level', curr.techLevel, prev.techLevel, true);
  num('attack', curr.attack, prev.attack);
  num('health', curr.health, prev.health);
  num('durability', curr.durability, prev.durability);
  num('armor', curr.armor, prev.armor);

  changed('rune', 'rework', curr.rune, prev.rune);
  changed('race', 'rework', curr.race, prev.race);
  changed('spell-school', 'rework', curr.spellSchool, prev.spellSchool);
  changed('rarity', 'rework', curr.rarity, prev.rarity);

  changed('name', 'neutral', curr.localization?.name, prev.localization?.name);
  changed('text', 'rework', curr.localization?.richText, prev.localization?.richText);

  return sortGlow(entries);
}
