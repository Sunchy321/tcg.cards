import { isDeepStrictEqual } from 'node:util';

import type { DocumentMeta, DocumentStatistics } from '@tcg-cards/model/magic/schema/document-content';

import type { Node } from './store';

/** Counts saved node text, treating a complete game symbol as one character. */
export function calculateStatistics(nodes: Node[], ruleKind?: 'magic-cr', previous?: DocumentMeta): DocumentMeta {
  let characterCount = 0;
  let wordCount = 0;
  for (const node of nodes) {
    const text = node.rawText.replace(/\{[^{}\s]+\}/gu, '\uFFFC');
    characterCount += [...text.replace(/\s/gu, '')].length;
    wordCount += (text.match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) ?? []).length;
  }
  const counts = {
    characterCount, wordCount, entryCount:        nodes.length,
    ...(ruleKind === 'magic-cr' ? crCounts(nodes) : { chapterCount: null, ruleCount: null, exampleCount: null, termCount: null }),
    calculatorVersion: 'rule-statistics-v1',
  };
  const { calculatedAt: _at, ...oldCounts } = previous ?? {};
  // Keep the timestamp stable on retries; it describes the retained calculation.
  return isDeepStrictEqual(counts, oldCounts) ? previous! : { ...counts, calculatedAt: new Date().toISOString() };
}

/** Classifies CR anchors without imposing its structure on other rulebooks. */
function crCounts(nodes: Node[]): Pick<DocumentStatistics, 'chapterCount' | 'ruleCount' | 'exampleCount' | 'termCount'> {
  return {
    chapterCount: nodes.filter(node => node.kind === 'heading' && /^[1-9]\d?$/.test(node.anchor ?? '')).length,
    ruleCount:    nodes.filter(node => /^\d+\.\d+[a-z]*$/.test(node.anchor ?? '')).length,
    exampleCount: nodes.filter(node => node.kind === 'example').length,
    termCount:    nodes.filter(node => node.kind === 'implicit_heading' && node.anchor?.startsWith('glossary.')).length,
  };
}
