import { CRAFTABLE_TEXT_BUILD, LOCALIZATION_HINTS } from './constant';

/** Identifies historical text interpretation without coupling identity to individual builds. */
export function computeLocalizationHints(localization: { richText: string }, build: number): string[] {
  return build < CRAFTABLE_TEXT_BUILD && localization.richText.includes('&')
    ? [LOCALIZATION_HINTS.LEGACY_TEXT_AMPERSAND]
    : [];
}
