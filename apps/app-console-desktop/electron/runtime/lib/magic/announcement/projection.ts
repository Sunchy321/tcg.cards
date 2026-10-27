import { magicFormatKeywordMap } from './data/format-keywords';

/** Expand a format keyword to its target formats; literal format ids pass through unchanged. */
export function resolveFormats(format: string | null): string[] {
  if (format == null) {
    return [];
  }
  return magicFormatKeywordMap[format] ?? [format];
}

/** Parse an authored banlist copy reference without treating malformed references as groups. */
export function cloneSourceFormats(cardId: string): string[] | null {
  if (!cardId.startsWith('#{clone')) {
    return null;
  }
  const match = /^#\{clone:([^{}]+)\}$/.exec(cardId);
  if (match == null) {
    throw new Error(`禁排表复制写法无效：${cardId}`);
  }
  const formats = match[1]!.split(',').map(id => id.trim());
  if (formats.some(id => id.length === 0) || new Set(formats).size !== formats.length) {
    throw new Error(`禁排表来源赛制无效或重复：${cardId}`);
  }
  return formats;
}

/** A # cardId other than a clone reference addresses a sentinel group. */
export function isSentinelCardId(cardId: string): boolean {
  return cardId.startsWith('#') && !cardId.startsWith('#{clone');
}
