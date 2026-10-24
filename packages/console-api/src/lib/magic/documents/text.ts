import { textMarker } from '@tcg-cards/model/magic/schema/document-content';
import type { TextMarker } from '@tcg-cards/model/magic/schema/document-content';

/** Converts supported import annotations to readable text and semantic ranges. */
export function importText(input: string, anchors: Set<string>): { rawText: string, markers: TextMarker[] } {
  let rawText = '';
  const markers: TextMarker[] = [];
  // Game symbols remain ordinary text; only explicit annotations change representation.
  const pattern = /@card\(([^)]+)\)\{([^}]+)\}|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let previous = 0;
  for (const match of input.matchAll(pattern)) {
    rawText += input.slice(previous, match.index);
    const start = rawText.length;
    const label = match[2] ?? match[3] ?? match[4]!;
    rawText += label;
    const range = { start, end: rawText.length };
    if (match[1]) markers.push({ ...range, type: 'card', cardId: match[1] });
    else if (match[3]) markers.push({ ...range, type: 'emphasis', style: 'strong' });
    else markers.push({ ...range, type: 'link', href: match[5]! });
    previous = match.index + match[0].length;
  }
  rawText += input.slice(previous);
  for (const match of rawText.matchAll(/(?<![a-zA-Z0-9_])\d{3}\.\d+[a-z]*(?![a-z0-9])/gu)) {
    if (anchors.has(match[0]) && !markers.some(marker => marker.start <= match.index && marker.end > match.index)) {
      markers.push({ type: 'chapter', anchor: match[0], start: match.index, end: match.index + match[0].length });
    }
  }
  return { rawText, markers };
}

/** Validates shared annotation ranges without splitting Unicode characters. */
export function validateMarkers(text: string, input: TextMarker[]): TextMarker[] {
  const markers = input.map(marker => textMarker.parse(marker));
  for (const marker of markers) {
    if (marker.end > text.length || splitsCharacter(text, marker.start) || splitsCharacter(text, marker.end)) {
      throw new Error('Invalid marker range: outside text or splits a character');
    }
  }
  return markers;
}

/** Detects UTF-16 offsets between the two halves of one Unicode code point. */
function splitsCharacter(text: string, offset: number): boolean {
  if (offset <= 0 || offset >= text.length) return false;
  const before = text.charCodeAt(offset - 1);
  const after = text.charCodeAt(offset);
  return before >= 0xD800 && before <= 0xDBFF && after >= 0xDC00 && after <= 0xDFFF;
}
