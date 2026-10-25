import { sortGlow } from '@tcg-cards/shared/hearthstone/glow';
import type { GlowEntry } from '@tcg-cards/model/hearthstone/schema/announcement';
import type { RenderModel } from '@tcg-cards/model/hearthstone/schema/entity';
import { getDisplayText, type DisplayContext } from '../task/project/display';

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
 * Rough display context built from a render model. Cross-card reference maps are
 * left empty: the glow calc only needs to know whether the display text changed,
 * not resolve every referenced card exactly.
 */
function renderModelDisplayContext(model: RenderModel): DisplayContext {
  return {
    cardId:  model.cardId,
    dbfId:   0,
    locale:  model.lang,
    classes: model.classes,
    // The render model carries the render-relevant mechanic tags; keep the rest empty.
    tags:    new Map(
      Object.entries(model.renderMechanics ?? {}).map(([id, value]) => [
        Number(id),
        typeof value === 'boolean' ? Number(value) : (value ?? 0),
      ]),
    ),
    cardIdByDbfId:   new Map(),
    nameByDbfId:     new Map(),
    richTextByDbfId: new Map(),
  };
}

/** Resolves a rough display text from the render model; null when it cannot be computed. */
function tryGetDisplayText(model: RenderModel): string | null {
  const richText = model.localization?.richText;
  if (richText == null) return null;
  try {
    return getDisplayText(renderModelDisplayContext(model), richText, model.textBuilderType);
  } catch {
    return null;
  }
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
  // Battlegrounds trinkets encode their size (lesser/greater) in spellSchool;
  // a size change is directional instead of a generic rework.
  const isTrinket = curr.type === 'trinket' || prev.type === 'trinket';
  if (isTrinket && curr.spellSchool !== prev.spellSchool) {
    const trinketType = prev.spellSchool === 'lesser_trinket' && curr.spellSchool === 'greater_trinket'
      ? 'nerf'
      : prev.spellSchool === 'greater_trinket' && curr.spellSchool === 'lesser_trinket'
        ? 'buff'
        : 'rework';
    entries.push({ part: 'trinket-size', type: trinketType });
  } else {
    changed('spell-school', 'rework', curr.spellSchool, prev.spellSchool);
  }
  changed('rarity', 'rework', curr.rarity, prev.rarity);

  changed('name', 'neutral', curr.localization?.name, prev.localization?.name);

  // Compare display text when both sides resolve; otherwise fall back to raw rich
  // text so a partially-unresolvable side does not produce a mismatched comparison.
  const currDisplay = tryGetDisplayText(curr);
  const prevDisplay = tryGetDisplayText(prev);
  const useDisplay = currDisplay != null && prevDisplay != null;
  changed('text', 'rework',
    useDisplay ? currDisplay : curr.localization?.richText,
    useDisplay ? prevDisplay : prev.localization?.richText);

  return sortGlow(entries);
}
