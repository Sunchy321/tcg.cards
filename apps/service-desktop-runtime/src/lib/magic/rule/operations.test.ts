import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { memoryStore } from '@tcg-cards/console-api/lib/magic/documents/testing';
import { createDocumentService } from '@tcg-cards/console-api/lib/magic/documents/service';
import { createRuleOperations } from './operations';
import type { RuleImportAttempt } from './operations';

const cr = `Magic: The Gathering Comprehensive Rules

These rules are effective as of October 1, 2026.

Introduction

An example rulebook.

Contents

Credits

1. Game Concepts

100. General

100.1. Pay {W} to continue.
`;

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

/** Creates a downloaded official edition in an isolated archive. */
async function archive(content = cr) {
  const root = await mkdtemp(join(tmpdir(), 'cr-import-'));
  directories.push(root);
  await mkdir(join(root, 'txt'));
  await writeFile(join(root, 'txt', '2026-10-01.txt'), content);
  return root;
}

test('imports a downloaded edition and retains its status when the rule page is reopened', async () => {
  const root = await archive(`\uFEFF${cr.replaceAll('\n', '\r\n')}`);
  const store = memoryStore();
  const rules = createRuleOperations({ root, store, recordImport: async () => {} });
  expect(await rules.listLocal()).toEqual([
    { date: '2026-10-01', files: { txt: true, doc: false, pdf: false }, imported: false, releaseId: null, totalNodes: null },
  ]);

  const imported = await rules.importVersion({ version: '2026-10-01' });
  expect(imported.totalNodes).toBe(5);
  const reopened = createRuleOperations({ root, store, recordImport: async () => {} });
  expect(await reopened.listLocal()).toEqual([
    { date: '2026-10-01', files: { txt: true, doc: false, pdf: false }, imported: true, releaseId: imported.releaseId, totalNodes: 5 },
  ]);
  const page = await reopened.read({ versionTag: '20261001' });
  expect(page.sections.find(node => node.nodeId === '100.1')?.text).toBe('Pay {W} to continue.');
});

test('repeated imports retain one saved revision and a failed replacement preserves readable content', async () => {
  const root = await archive();
  const store = memoryStore();
  const attempts: RuleImportAttempt[] = [];

  const rules = createRuleOperations({
    root,
    store,
    recordImport: async attempt => { attempts.push(attempt); },
  });

  const first = await rules.importVersion({ version: '2026-10-01' });
  expect(await rules.importVersion({ version: '2026-10-01' })).toEqual(first);
  expect(await createDocumentService(store, { track: 'local' }).revisions('magic-cr')).toHaveLength(1);

  await writeFile(join(root, 'txt', '2026-10-01.txt'), cr.replace('Pay {W} to continue.', 'Replacement rule.'));
  await expect(rules.importVersion({ version: '2026-10-01' })).rejects.toThrow('different content');
  expect(attempts.at(-1)).toMatchObject({ status: 'failed', error: 'Official release already exists with different content' });
  expect((await rules.read({})).sections.find(node => node.nodeId === '100.1')?.text).toBe('Pay {W} to continue.');

  await writeFile(join(root, 'txt', '2026-10-01.txt'), cr);
  expect(await rules.importVersion({ version: '2026-10-01' })).toEqual(first);
});

test('rejects invalid sources without presenting an imported article and allows retry', async () => {
  const root = await archive('These rules are effective as of October 1, 2026.');
  const store = memoryStore();
  const rules = createRuleOperations({ root, store, recordImport: async () => {} });
  await expect(rules.importVersion({ version: '2026-10-01' })).rejects.toThrow('no rule nodes');
  expect((await rules.listLocal())[0]?.imported).toBe(false);
  await expect(rules.importVersion({ version: '../../outside' })).rejects.toThrow();
  await expect(rules.importVersion({ version: '2026-02-31' })).rejects.toThrow();
  await expect(rules.importVersion({ version: '2026-09-01' })).rejects.toThrow('ENOENT');
  await writeFile(join(root, 'txt', '2026-10-01.txt'), cr);
  await rules.importVersion({ version: '2026-10-01' });
  expect((await rules.listLocal())[0]?.imported).toBe(true);
});

test('retains imported status when original files are no longer present', async () => {
  const root = await archive();
  const rules = createRuleOperations({ root, store: memoryStore(), recordImport: async () => {} });
  const imported = await rules.importVersion({ version: '2026-10-01' });
  await rm(join(root, 'txt'), { recursive: true });
  expect(await rules.listLocal()).toEqual([
    { date: '2026-10-01', files: { txt: false, doc: false, pdf: false }, imported: true, releaseId: imported.releaseId, totalNodes: imported.totalNodes },
  ]);
});

test('imports actual archive files and adds newly downloaded formats on reimport', async () => {
  const root = await archive();
  const store = memoryStore();
  const rules = createRuleOperations({ root, store, recordImport: async () => {} });
  await mkdir(join(root, 'doc'));
  await writeFile(join(root, 'doc', '2026-10-01.doc'), 'original Word file');
  const first = await rules.importVersion({ version: '2026-10-01' });
  expect((await rules.read({})).files.map(({ format, language, storageKey }) => ({ format, language, storageKey }))).toEqual([
    { format: 'txt', language: 'en', storageKey: 'magic/rule/txt/2026-10-01.txt' },
    { format: 'doc', language: 'en', storageKey: 'magic/rule/doc/2026-10-01.doc' },
  ]);
  await mkdir(join(root, 'pdf'));
  await writeFile(join(root, 'pdf', '2026-10-01.pdf'), 'original PDF');
  await rm(join(root, 'doc', '2026-10-01.doc'));
  expect(await rules.importVersion({ version: '2026-10-01' })).toEqual(first);
  expect((await rules.read({})).files.map(file => file.format)).toEqual(['txt', 'doc', 'pdf']);
  expect(await store.releases('magic-cr')).toHaveLength(1);
  expect(await store.revisions('magic-cr')).toHaveLength(1);
});

test('imports byte-accurate descriptors for all original formats without inventing provenance', async () => {
  const original = Buffer.from(`\uFEFF${cr.replaceAll('\n', '\r\n')}`);
  const root = await archive(original.toString('utf8'));
  const samples = [
    { format: 'txt', dir: 'txt', bytes: original, contentType: 'text/plain' },
    { format: 'doc', dir: 'doc', bytes: Buffer.from('d0cf11e0a1b11ae10001', 'hex'), contentType: 'application/msword' },
    { format: 'docx', dir: 'doc', bytes: Buffer.from('504b03040102', 'hex'), contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    { format: 'pdf', dir: 'pdf', bytes: Buffer.from('%PDF-1.7\noriginal\n'), contentType: 'application/pdf' },
    { format: 'rtf', dir: 'rtf', bytes: Buffer.from('{\\rtf1 original}'), contentType: 'application/rtf' },
  ];
  for (const sample of samples) {
    await mkdir(join(root, sample.dir), { recursive: true });
    await writeFile(join(root, sample.dir, `2026-10-01.${sample.format}`), sample.bytes);
  }
  const store = memoryStore();
  const rules = createRuleOperations({ root, store, recordImport: async () => {} });
  await rules.importVersion({ version: '2026-10-01' });
  const page = await rules.read({});
  expect(page.files).toHaveLength(5);
  for (const sample of samples) {
    expect(page.files.find(file => file.format === sample.format)).toMatchObject({
      format:           sample.format,
      size:             sample.bytes.length,
      sha256:           createHash('sha256').update(sample.bytes).digest('hex'),
      contentType:      sample.contentType,
      storageKey:       `magic/rule/${sample.dir}/2026-10-01.${sample.format}`,
      sourceUrl:        null, effectiveUrl:     null, originalFilename: null,
    });
  }
  expect(page.files.find(file => file.format === 'txt')?.encoding).toBe('utf-8');
  expect(page.files.find(file => file.format === 'pdf')?.pageCount).toBeNull();
  expect(page.files.every(file => !('downloadUrl' in file))).toBe(true);
  expect(page.sections.find(node => node.nodeId === '100.1')?.text).toBe('Pay {W} to continue.');
  await rules.importVersion({ version: '2026-10-01' });
  expect((await rules.read({})).files).toEqual(page.files);
});

test('retains verified provenance across reimports and rejects a mismatched fingerprint', async () => {
  const root = await archive();
  const rules = createRuleOperations({ root, store: memoryStore(), recordImport: async () => {} });
  const provenance = {
    format:           'txt' as const,
    language:         'en',
    sourceUrl:        'https://media.example.test/original.txt',
    effectiveUrl:     'https://cdn.example.test/original.txt',
    originalFilename: 'MagicCompRules 20261002.txt',
    sourceKind:       'official',
    publisher:        'Wizards of the Coast',
    filenameDate:     '2026-10-02',
  };
  await rules.importVersion({ version: '2026-10-01', files: [provenance] });
  const [first] = (await rules.read({})).files;
  expect(first).toMatchObject({ ...provenance, declaredEffectiveDate: '2026-10-01', dateBasis: 'document' });
  await rules.importVersion({ version: '2026-10-01' });
  expect((await rules.read({})).files[0]).toEqual(first);
  await expect(rules.importVersion({ version: '2026-10-01', files: [{ ...provenance, sha256: '0'.repeat(64) }] })).rejects.toThrow('supplied metadata');
  expect((await rules.read({})).files[0]).toEqual(first);
});

test('decodes a Unicode TXT for import while hashing and retaining its original bytes', async () => {
  const root = await archive();
  const bytes = Buffer.from(`\uFEFF${cr}`, 'utf16le');
  await writeFile(join(root, 'txt', '2026-10-01.txt'), bytes);
  const rules = createRuleOperations({ root, store: memoryStore(), recordImport: async () => {} });
  await rules.importVersion({ version: '2026-10-01' });
  const page = await rules.read({});
  expect(page.files[0]).toMatchObject({ encoding: 'utf-16le', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  expect(page.sections.find(node => node.nodeId === '100.1')?.text).toBe('Pay {W} to continue.');
  expect(Buffer.from(await Bun.file(join(root, 'txt', '2026-10-01.txt')).arrayBuffer())).toEqual(bytes);
});

// Isolate the RPC adapter from package tests that globally replace the database module.
test.skipIf(!process.env.DOCUMENT_TEST_LOCAL_URL)('PostgreSQL desktop rule RPC integration', async () => {
  const child = Bun.spawn([process.execPath, 'test', fileURLToPath(new URL('./operations.integration.ts', import.meta.url))], {
    stdout: 'pipe', stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect(code, `${stdout}\n${stderr}`).toBe(0);
}, 30000);
