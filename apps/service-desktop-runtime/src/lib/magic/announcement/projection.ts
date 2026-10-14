import { magicFormatKeywordMap } from './data/format-keywords';

/** Expand a format keyword to its target formats; literal format ids pass through unchanged. */
export function resolveFormats(format: string | null): string[] {
  if (format == null) {
    return [];
  }
  return magicFormatKeywordMap[format] ?? [format];
}

/** A cardId starting with # addresses a sentinel group (e.g. #conspiracy) rather than a single card. */
export function isSentinelCardId(cardId: string): boolean {
  return cardId.startsWith('#');
}
