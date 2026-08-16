import { glowPart } from '@tcg-cards/model/src/hearthstone/schema/announcement';
import type { GlowEntry } from '@tcg-cards/model/src/hearthstone/schema/announcement';

const GLOW_PART_ORDER = new Map(glowPart.options.map((part, index) => [part, index]));

/** Sorts glow entries by the canonical glow part order so equal changes share one renderHash. */
export function sortGlow(glow: GlowEntry[]): GlowEntry[] {
  return [...glow].sort(
    (a, b) => (GLOW_PART_ORDER.get(a.part) ?? Number.MAX_SAFE_INTEGER) - (GLOW_PART_ORDER.get(b.part) ?? Number.MAX_SAFE_INTEGER),
  );
}
