import { expect, test } from 'bun:test';

import { createDocumentService } from './service';
import { memoryStore } from './testing';
import { createComparisonOperations } from './comparison';
import { beforeMovement, afterMovement } from './movement.fixture';
import { createTranslationOperations } from './translations';
import { importText } from './text';

test('proves reference renumbering using the moved target instead of treating every numeric edit as a reference update', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  await service.importCr({ content: beforeMovement });
  await service.importCr({ content: afterMovement });
  const result = await createComparisonOperations(store, { track: 'local' }).compare({ slug: 'magic-cr', fromVersionTag: '20260807', toVersionTag: '20260925', locale: 'en' });
  expect(result.rows.find(row => row.kind === 'change' && row.to?.nodeId === '506.8c')).toMatchObject({
    referenceOnly: true, referenceUpdates: [{ from: '506.7', to: '506.8' }],
  });
  expect(result.stats).toMatchObject({ modified: 0, referenceUpdated: 1 });
});

const header = 'Magic: The Gathering Comprehensive Rules\n\nThese rules are effective as of October 1, 2026.\n\nIntroduction\n\nReference regression.\n\nContents\n\nCredits\n\n1. Game Concepts\n\n100. General\n\n';

/** Import two tiny formal versions through the real source operation. */
async function compareReference(before: string, after: string) {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  await service.importCr({ content: header + before });
  await service.importCr({ content: header.replace('October 1', 'November 1') + after });
  return createComparisonOperations(store, { track: 'local' }).compare({ slug: 'magic-cr', fromVersionTag: '20261001', toVersionTag: '20261101', locale: 'en' });
}

/** Insert before a referenced rule without changing its actual text. */
function referenceBodies(before: string, after: string) {
  return [
    '100.1. Pay {W} to continue.\n\n100.3. ' + before + '\n',
    '100.1. A wholly new requirement.\n\n100.2. Pay {W} to continue.\n\n100.3. ' + after + '\n',
  ] as const;
}

test('does not call retargeting another unchanged rule a reference renumbering', async () => {
  const bodies = '100.1. Pay {W} to continue.\n\n100.2. Draw a card.\n\n100.3. See rule ';
  const result = await compareReference(bodies + '100.1.\n', bodies + '100.2.\n');
  expect(result.rows.find(row => row.kind === 'change' && row.to?.nodeId === '100.3')).toMatchObject({ referenceOnly: false, referenceUpdates: [] });
  expect(result.stats).toMatchObject({ modified: 1, referenceUpdated: 0 });
});

test('does not treat coincidental costs or unproven numeric text as semantic rule references', async () => {
  for (const [before, after] of [
    ['Pay 100.1.', 'Pay 100.2.'],
    ['See rule 999.1.', 'See rule 999.2.'],
    ['See rule 100.1, then pay 100.1.', 'See rule 100.2, then pay 100.2.'],
  ]) {
    const result = await compareReference(...referenceBodies(before!, after!));
    expect(result.rows.find(row => row.kind === 'change' && row.to?.nodeId === '100.3')).toMatchObject({ referenceOnly: false });
    expect(result.stats.referenceUpdated).toBe(0);
  }
});

test('separates proven reference highlights from real wording changes in the same paragraph', async () => {
  const result = await compareReference(...referenceBodies('See rule 100.1. Draw one card.', 'See rule 100.2. Draw two cards.'));
  const row = result.rows.find(row => row.kind === 'change' && row.to?.nodeId === '100.3');
  expect(row).toMatchObject({ referenceOnly: false, referenceUpdates: [{ from: '100.1', to: '100.2' }] });
  if (row?.kind !== 'change') throw new Error('Missing changed reference');
  expect(row.textDiff?.blocks.filter(block => block.isMinor)).toEqual([
    { type: 'removed', text: '100.1', isMinor: true }, { type: 'added', text: '100.2', isMinor: true },
  ]);
  expect(row.textDiff?.blocks.filter(block => block.type !== 'added').map(block => block.text).join('')).toBe('See rule 100.1. Draw one card.');
  expect(row.textDiff?.blocks.filter(block => block.type !== 'removed').map(block => block.text).join('')).toBe('See rule 100.2. Draw two cards.');
  expect(row.textDiff?.blocks.some(block => block.type === 'common' && block.text.includes('card'))).toBe(true);
  expect(row.textDiff?.blocks.some(block => block.type === 'removed' && !block.isMinor)).toBe(true);
  expect(row.textDiff?.blocks.some(block => block.type === 'added' && !block.isMinor)).toBe(true);
});

test('does not confirm a moved target with unrelated changed content', async () => {
  const [before, after] = referenceBodies('See rule 100.1.', 'See rule 100.2.');
  const result = await compareReference(before, after.replace('100.2. Pay {W} to continue.', '100.2. Completely unrelated new text.'));
  expect(result.rows.find(row => row.kind === 'change' && row.to?.nodeId === '100.3')).toMatchObject({ referenceOnly: false, referenceUpdates: [] });
});

test('grounds transitive reference updates in an independently unchanged target', async () => {
  const result = await compareReference(
    '100.1. Pay {W} to continue.\n\n100.2. See rule 100.1.\n\n100.4. Follow rule 100.2.\n',
    '100.1. A new requirement.\n\n100.2. Pay {W} to continue.\n\n100.3. See rule 100.2.\n\n100.4. Follow rule 100.3.\n',
  );
  expect(result.rows.find(row => row.kind === 'change' && row.to?.nodeId === '100.4')).toMatchObject({
    referenceOnly: true, referenceUpdates: [{ from: '100.2', to: '100.3' }],
  });
});


test('checks Chinese marker offsets and does not conceal source-content changes behind translated reference updates', async () => {
  for (const sourceChanged of [false, true]) {
    const store = memoryStore();
    const service = createDocumentService(store, { track: 'local' });
    const translations = createTranslationOperations(store, { track: 'local' });
    const [oldBody, newBody] = referenceBodies('See rule 100.1. Draw one card.', `See rule 100.2. Draw ${sourceChanged ? 'two cards' : 'one card'}.`);
    const first = await service.importCr({ content: header + oldBody });
    const second = await service.importCr({ content: header.replace('October 1', 'November 1') + newBody });
    for (const [edition, text] of [[first, '参见规则100.1。'], [second, '参见规则100.2。']] as const) {
      const source = (await store.revision(edition.revisionId))!;
      const revision = await translations.saveTranslation({ documentId: 'magic-cr', sourceRevisionId: source.id, language: 'zhs', nodes: [{
        sourceNodeId: source.nodes.find(node => node.anchor === '100.3')!.id,
        ...importText(text, new Set(source.nodes.flatMap(node => node.anchor == null ? [] : [node.anchor]))), translationMethod: 'human',
      }] });
      await translations.selectTranslation({ documentId: 'magic-cr', releaseId: edition.releaseId, revisionId: revision.id });
    }
    const result = await createComparisonOperations(store, { track: 'local' }).compare({ slug: 'magic-cr', fromVersionTag: '20261001', toVersionTag: '20261101', locale: 'zhs' });
    expect(result.rows.find(row => row.kind === 'change' && row.to?.nodeId === '100.3')).toMatchObject({ referenceOnly: !sourceChanged,
      referenceUpdates: [{ from: '100.1', to: '100.2' }], textDiff: { blocks: [
        { type: 'common', text: '参见规则' }, { type: 'removed', text: '100.1', isMinor: true },
        { type: 'added', text: '100.2', isMinor: true }, { type: 'common', text: '。' },
      ] } });
  }
});

test('does not confirm numbering from ambiguous identical targets', async () => {
  const result = await compareReference(
    '100.1. Pay {W} to continue.\n\n100.2. Pay {W} to continue.\n\n100.4. See rule 100.1.\n',
    '100.1. A new requirement.\n\n100.2. Pay {W} to continue.\n\n100.3. Pay {W} to continue.\n\n100.4. See rule 100.2.\n',
  );
  expect(result.rows.find(row => row.kind === 'change' && row.to?.nodeId === '100.4')).toMatchObject({ referenceOnly: false, referenceUpdates: [] });
});


test('retains a proven update when another reference is added to the same paragraph', async () => {
  const result = await compareReference(
    '100.1. Pay {W} to continue.\n\n100.2. Draw a card.\n\n100.4. See rule 100.1.\n',
    '100.1. A new requirement.\n\n100.2. Pay {W} to continue.\n\n100.3. Draw a card.\n\n100.4. See rule 100.2 and rule 100.3.\n',
  );
  const row = result.rows.find(row => row.kind === 'change' && row.to?.nodeId === '100.4');
  expect(row).toMatchObject({ referenceOnly: false, referenceUpdates: [{ from: '100.1', to: '100.2' }] });
  if (row?.kind !== 'change') throw new Error('Missing changed reference');
  expect(row.textDiff?.blocks.filter(block => block.isMinor)).toEqual([
    { type: 'removed', text: '100.1', isMinor: true }, { type: 'added', text: '100.2', isMinor: true },
  ]);
  expect(row.textDiff?.blocks.some(block => block.type === 'added' && !block.isMinor && block.text.includes('100.3'))).toBe(true);
});


test('preserves repeated references when their complete target sequence is unchanged', async () => {
  const result = await compareReference(...referenceBodies('See rule 100.1, then follow rule 100.1.', 'See rule 100.2, then follow rule 100.2.'));
  const row = result.rows.find(row => row.kind === 'change' && row.to?.nodeId === '100.3');
  expect(row).toMatchObject({ referenceOnly: true, referenceUpdates: [{ from: '100.1', to: '100.2' }] });
  if (row?.kind !== 'change') throw new Error('Missing changed reference');
  expect(row.textDiff?.blocks.filter(block => block.isMinor)).toHaveLength(4);
});
