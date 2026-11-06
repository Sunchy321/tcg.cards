import { CRAFTABLE_TEXT_BUILD, RENDER_HINTS } from './constant';
import type { LocalizationlessEntityRow, LocalizationlessLocalizationRow } from './types';

/** Computes semantic compatibility hints; absent hints use the renderer's baseline behavior. */
export function computeRenderHints(
  _entity: LocalizationlessEntityRow,
  localization: Pick<LocalizationlessLocalizationRow, 'richText'>,
  build: number,
): string[] {
  const hints: string[] = [];

  // The current client treats unescaped ampersands as craftable separators.
  // Old text used literal ampersands; mark only affected locales to preserve image reuse.
  if (build < CRAFTABLE_TEXT_BUILD && localization.richText.includes('&')) {
    hints.push(RENDER_HINTS.LEGACY_TEXT_AMPERSAND);
  }

  return hints;
}
