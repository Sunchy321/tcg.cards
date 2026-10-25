import type { LocalizationlessEntityRow } from './types';

/**
 * Compute semantic render hints for a card at a given build.
 *
 * Each hint follows the format `{scope}-{aspect}-v{n}` where:
 * - scope:   the affected card range (e.g. "hunter", "dual-class")
 * - aspect:  what changed (e.g. "template-color", "class-order")
 * - v{n}:    behaviour version (v1 = baseline, omitted; v2+ = deviation)
 *
 * No hint = baseline behaviour for all aspects.
 */
export function computeRenderHints(_entity: LocalizationlessEntityRow, _build: number): string[] {
  const hints: string[] = [];

  // TODO: add hint rules here as renderer behaviour changes are discovered.
  // Example:
  //   if (entity.classes.includes('hunter') && build >= XXXXXX) {
  //     hints.push('hunter-template-color-v2');
  //   }

  return hints;
}
