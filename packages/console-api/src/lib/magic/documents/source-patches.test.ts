import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { createDocumentService } from './service';
import { memoryStore } from './testing';
import { communitySource, communityTranslation } from './community.fixture';
import { patchCrSource } from './source-patches';

/** Preserve the exact duplicate-number sequence from the official September 2024 TXT. */
const sequence = [
  "702.175. Offspring",
  "702.175a Offspring represents two abilities. “Offspring [cost]” means “You may pay an additional [cost] as you cast this spell” and “When this permanent enters, if its offspring cost was paid, create a token that’s a copy of it, except it’s 1/1.”",
  "702.175b If a spell has multiple instances of offspring, each is paid separately and triggers based on the payments made for it, not any other instances of offspring.",
  "702.175. Impending",
  "702.175a Impending is a keyword that represents four abilities. The first and second are static abilities that function while the spell with impending is on the stack. The third is a static ability that functions on the battlefield. The fourth is a triggered ability that functions on the battlefield. “Impending N—[cost]” means “You may choose to pay [cost] rather than pay this spell’s mana cost,” “If you chose to pay this spell’s impending cost, it enters with N time counters on it,” “As long as this permanent has a time counter on it, if it was cast for its impending cost, it’s not a creature,” and “At the beginning of your end step, if this permanent was cast for its impending cost and there is at least one time counter on it, remove a time counter from it.” Casting a spell for its impending cost follows the rules for paying alternative costs in rules 601.2b and 601.2f–h."
];

/** Retain the official bytes while surrounding the historical defect with a complete document. */
const source = communitySource.replace('September 25, 2026', 'September 20, 2024')
  .replace('\nGlossary\n', `\n7. Additional Rules\n\n702. Keyword Abilities\n\n${sequence.join('\n\n')}\n\nGlossary\n`);

test('patches the September duplicate Impending numbers without changing the source revision hash', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  const imported = await service.importCr({ content: source });
  const expected = `magic-cr:${createHash('sha256').update(source.trimEnd() + '\n').digest('hex')}`;
  expect(imported.revisionId).toBe(expected);
  const page = await service.read({ slug: 'magic-cr' });
  expect(page.sections.find(node => node.nodeId === '702.175')?.text).toBe('Offspring');
  expect(page.sections.find(node => node.nodeId === '702.175a')?.text).toBe(sequence[1]!.slice('702.175a '.length));
  expect(page.sections.find(node => node.nodeId === '702.175b')?.parentNodeId).toBe('702.175');
  expect(page.sections.find(node => node.nodeId === '702.176')?.text).toBe('Impending');
  expect(page.sections.find(node => node.nodeId === '702.176a')).toMatchObject({ text: sequence[4]!.slice('702.175a '.length), parentNodeId: '702.176' });
});

test('imports Chinese under the patched source identities without changing the original file', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  await service.importCr({ content: source });
  const content = { ...communityTranslation, version: '20240917',
    intro: { contents: communityTranslation.intro.contents.map((entry, index) => index === 1
      ? { ...entry, en: 'These rules are effective as of September 20, 2024.' } : entry) },
    main: [...communityTranslation.main, { chapter: '7.', en: 'Additional Rules', zh: '其他规则', subrules: [{
      chapter: '702.', en: 'Keyword Abilities', zh: '关键字异能', subrules: [
        { chapter: '702.175.', en: 'Offspring', zh: '繁生', subrules: [
          { chapter: '702.175a', en: sequence[1]!.slice('702.175a '.length), zh: '繁生代表两个异能。' },
          { chapter: '702.175b', en: sequence[2]!.slice('702.175b '.length), zh: '多个繁生异能分别支付。' },
        ] },
        { chapter: '702.176.', en: 'Impending', zh: '隐现', subrules: [
          { chapter: '702.176a', en: sequence[4]!.slice('702.175a '.length), zh: '隐现代表四个异能。' },
        ] },
      ],
    }] }],
  };
  await service.importCrTranslation({ versionTag: '20240920', content });
  const page = await service.read({ slug: 'magic-cr', locale: 'zhs' });
  expect(page.sections.find(node => node.nodeId === '702.175')?.text).toBe('繁生');
  expect(page.sections.find(node => node.nodeId === '702.176')?.text).toBe('隐现');
  expect(page.sections.find(node => node.nodeId === '702.176a')?.text).toBe('隐现代表四个异能。');
});


test('leaves other dates, edited text, already corrected files and conflicting numbering untouched', () => {
  const paragraphs = source.split(/\n\s*\n+/).map(part => part.trim()).filter(Boolean);
  expect(patchCrSource('20240921', paragraphs)).toBe(paragraphs);
  const wrongDate = paragraphs.map(part => part.replace('September 20, 2024', 'September 21, 2024'));
  expect(patchCrSource('20240920', wrongDate)).toBe(wrongDate);
  const changed = paragraphs.map(part => part === sequence[4] ? part + ' Another sentence.' : part);
  expect(patchCrSource('20240920', changed)).toBe(changed);
  const corrected = paragraphs.map(part => part === sequence[3] ? '702.176. Impending'
    : part === sequence[4] ? part.replace('702.175a ', '702.176a ') : part);
  expect(patchCrSource('20240920', corrected)).toBe(corrected);
  const conflict = [...paragraphs, '702.176. Another ability'];
  expect(patchCrSource('20240920', conflict)).toBe(conflict);
  const saved = [...paragraphs];
  const patched = patchCrSource('20240920', paragraphs);
  expect(paragraphs).toEqual(saved);
  expect(patched.filter((paragraph, index) => paragraph !== paragraphs[index])).toHaveLength(2);
});

test('manually reparses the same source revision to restore both overwritten abilities', async () => {
  const prepared = memoryStore();
  const imported = await createDocumentService(prepared, { track: 'local' }).importCr({ content: source });
  const revision = (await prepared.revision(imported.revisionId))!;
  const store = memoryStore();
  await store.putDocument((await prepared.document('magic-cr'))!);
  await store.putRevision({ ...revision, nodes: revision.nodes.filter(node => node.anchor !== '702.176' && node.anchor !== '702.176a')
    .map(node => node.anchor === '702.175' ? { ...node, rawText: 'Impending' }
      : node.anchor === '702.175a' ? { ...node, rawText: sequence[4]!.slice('702.175a '.length) } : node) });
  await store.putRelease((await prepared.releases('magic-cr'))[0]!);
  const service = createDocumentService(store, { track: 'local' });
  const reparsed = await service.importCr({ content: source });
  expect(reparsed.revisionId).toBe(imported.revisionId);
  expect(await service.revisions('magic-cr')).toHaveLength(1);
  expect(await store.releases('magic-cr')).toHaveLength(1);
  const page = await service.read({ slug: 'magic-cr' });
  expect(page.sections.find(node => node.nodeId === '702.175')?.text).toBe('Offspring');
  expect(page.sections.find(node => node.nodeId === '702.176')?.text).toBe('Impending');
});

const replacementQuote = '614.1c Effects that read “[This permanent] enters the battlefield with . . . ,” “As [this permanent] enters the battlefield . . . ,” or “[This permanent] enters the battlefield as . . . “ are replacement effects.';

test('preserves the original replacement-effect quote when importing faithful historical translations', async () => {
  for (const [version, date] of [['20231013', 'October 13, 2023'], ['20231117', 'November 17, 2023'], ['20240202', 'February 2, 2024']]) {
    const content = communitySource.replace('September 25, 2026', date!)
      .replace('\nGlossary\n', `\n6. Spells, Abilities, and Effects\n\n614. Replacement Effects\n\n614.1. Replacement effects modify events.\n\n${replacementQuote}\n\nGlossary\n`);
    const store = memoryStore();
    const service = createDocumentService(store, { track: 'local' });
    const imported = await service.importCr({ content });
    expect(imported.revisionId).toBe(`magic-cr:${createHash('sha256').update(content.trimEnd() + '\n').digest('hex')}`);
    const original = replacementQuote.slice('614.1c '.length);
    expect((await service.read({ slug: 'magic-cr' })).sections.find(node => node.nodeId === '614.1c')?.text).toBe(original);
    const paired = { ...communityTranslation,
      intro: { contents: communityTranslation.intro.contents.map((entry, index) => index === 1
        ? { ...entry, en: `These rules are effective as of ${date}.` } : entry) },
      main: [...communityTranslation.main, { chapter: '6.', en: 'Spells, Abilities, and Effects', zh: '咒语、异能和效应', subrules: [{
        chapter: '614.', en: 'Replacement Effects', zh: '替代性效应', subrules: [{
          chapter: '614.1.', en: 'Replacement effects modify events.', zh: '替代性效应修改事件。', subrules: [{
            chapter: '614.1c', en: original, zh: '这些格式的效应为替代性效应。',
          }],
        }],
      }] }],
    };
    await service.importCrTranslation({ versionTag: version!, content: paired });
    expect((await service.read({ slug: 'magic-cr', locale: 'zhs' })).sections.find(node => node.nodeId === '614.1c')?.text).toBe('这些格式的效应为替代性效应。');
  }
});

test('does not normalize replacement-effect quotes in other editions or edited paragraphs', () => {
  const header = 'These rules are effective as of February 2, 2024.';
  const paragraphs = [header, replacementQuote];
  expect(patchCrSource('20240607', paragraphs)).toBe(paragraphs);
  const changed = [header, replacementQuote + ' Extra content.'];
  expect(patchCrSource('20240202', changed)).toBe(changed);
  const duplicate = [header, replacementQuote, replacementQuote];
  expect(patchCrSource('20240202', duplicate)).toBe(duplicate);
});
