import type { DocumentChangeTextDiff } from '@tcg-cards/model/magic/schema/document-page';

/** Preserve a common prefix and suffix while highlighting the changed middle. */
export function textDiff(before: string, after: string): DocumentChangeTextDiff | null {
  if (before === after) return null;
  const left = Array.from(before);
  const right = Array.from(after);
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix++;
  let suffix = 0;
  while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - suffix - 1] === right[right.length - suffix - 1]) suffix++;
  const blocks: DocumentChangeTextDiff['blocks'] = [];
  if (prefix > 0) blocks.push({ type: 'common', text: left.slice(0, prefix).join('') });
  if (left.length > prefix + suffix) blocks.push({ type: 'removed', text: left.slice(prefix, left.length - suffix).join('') });
  if (right.length > prefix + suffix) blocks.push({ type: 'added', text: right.slice(prefix, right.length - suffix).join('') });
  if (suffix > 0) blocks.push({ type: 'common', text: left.slice(left.length - suffix).join('') });
  return { mode: 'inline', blocks };
}
