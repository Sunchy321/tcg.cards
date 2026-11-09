import { diffArrays } from 'diff';
import type { DocumentChangeTextDiff } from '@tcg-cards/model/magic/schema/document-page';

/** Keeps rule addresses intact while comparing all other Unicode characters individually. */
function tokens(text: string): string[] {
  return text.match(/(?<![a-zA-Z0-9_])\d{3}\.\d+[a-z]*(?![a-z0-9])|[\s\S]/gu) ?? [];
}

/** Highlights separate edits while retaining every unchanged interval. */
export function textDiff(before: string, after: string): DocumentChangeTextDiff | null {
  if (before === after) return null;
  const blocks: DocumentChangeTextDiff['blocks'] = diffArrays(tokens(before), tokens(after)).map(change => ({
    type: change.removed ? 'removed' : change.added ? 'added' : 'common',
    text: change.value.join(''),
  }));
  return { mode: 'inline', blocks };
}
