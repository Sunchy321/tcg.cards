import { expect, test } from 'bun:test';

import { createDocumentService } from './service';
import { memoryStore } from './testing';

const content = `Magic: The Gathering Comprehensive Rules

These rules are effective as of October 1, 2026.

Introduction

Hi.

Contents

Credits

1. Basics

100. General

100.1. Pay {W/U}.

100.1a Don’t stop!
Example: 中文😀 {W}.

Glossary

Test
A term.

Credits

Done.
`;

test('imports saved-text statistics with one character per game symbol and preserves them on retry', async () => {
  const store = memoryStore();
  const documents = createDocumentService(store, { track: 'local' });
  const imported = await documents.importCr({ content });
  const first = await documents.revision({ documentId: imported.documentId, revisionId: imported.revisionId });
  expect(first.meta).toMatchObject({
    characterCount:    86, wordCount:         14, entryCount:        11,
    chapterCount:      1, ruleCount:         2, exampleCount:      1, termCount:         1,
    calculatorVersion: 'rule-statistics-v1',
  });
  expect(first.meta?.calculatedAt).toEqual(expect.any(String));
  await documents.importCr({ content });
  const repeated = await documents.revision({ documentId: imported.documentId, revisionId: imported.revisionId });
  expect(repeated.meta).toEqual(first.meta);
  expect(await documents.revisions(imported.documentId)).toHaveLength(1);
});

test('counts only saved translated nodes and preserves source statistics and translation bindings', async () => {
  const documents = createDocumentService(memoryStore(), { track: 'local' });
  const imported = await documents.importCr({ content });
  const translated = await documents.saveTranslation({
    documentId:       imported.documentId, sourceRevisionId: imported.revisionId, language:         'zhs',
    nodes:            [{ sourceNodeId: `${imported.revisionId}/100.1`, rawText: '支付 {W/U}，别停！😀', translationMethod: 'human' }],
  });
  expect(translated.meta).toMatchObject({
    characterCount: 8, wordCount: 0, entryCount: 1, chapterCount: 0, ruleCount: 1, exampleCount: 0, termCount: 0,
  });
  await documents.selectTranslation({ documentId: imported.documentId, releaseId: imported.releaseId, revisionId: translated.id });
  await documents.importCr({ content });
  expect((await documents.revision({ documentId: imported.documentId, revisionId: imported.revisionId })).meta?.characterCount).toBe(86);
  expect((await documents.read({ slug: 'magic-cr', locale: 'zhs' })).sections.find(node => node.nodeId === '100.1')?.text).toBe('支付 {W/U}，别停！😀');
});

test('leaves CR-specific classifications unknown for independently authored content', async () => {
  const documents = createDocumentService(memoryStore(), { track: 'remote', actorId: 'alice' });
  const document = await documents.create({ slug: 'a-guide', title: 'Guide', language: 'en' });
  const source = await documents.save({ documentId: document.id, title: document.title, nodes: [{ nodeKey: '100.1', rawText: 'A guide.' }] });
  const translated = await documents.saveTranslation({
    documentId:       document.id, sourceRevisionId: source.id, language:         'zhs',
    nodes:            [{ sourceNodeId: source.nodes[0]!.id, rawText: '支付 {W/U}，别停！😀', translationMethod: 'human' }],
  });
  expect(translated.meta).toMatchObject({
    characterCount: 8, wordCount:      0, entryCount:     1,
    chapterCount:   null, ruleCount:      null, exampleCount:   null, termCount:      null,
  });
});
