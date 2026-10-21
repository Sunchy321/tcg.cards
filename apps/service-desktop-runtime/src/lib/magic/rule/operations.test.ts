import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { memoryStore } from '@tcg-cards/console-api/lib/magic/documents/testing';
import { createDocumentService } from '@tcg-cards/console-api/lib/magic/documents/service';
import { createRuleOperations } from './operations';
import { importExistingRules } from './existing';
import { publishDocument } from '@tcg-cards/console-api/lib/magic/documents/publish';
import { createRuleReader } from '@tcg-cards/console-api/lib/magic/documents/rules';
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


test('imports retained originals using matching overwrite evidence instead of the old inventory', async () => {
  const root = await archive();
  const research = await mkdtemp(join(tmpdir(), 'cr-evidence-'));
  directories.push(research);
  await mkdir(join(root, 'pdf'));
  await writeFile(join(root, 'pdf', '2026-10-01.pdf'), '%PDF-new');
  const txtHash = createHash('sha256').update(cr).digest('hex');
  const pdfHash = '6dbe1e7b812a8373a5f71216240d5767b562229f32755ef2e2aacb1f98b13945';
  // The fixture hash is independently fixed for the retained PDF bytes.
  expect(createHash('sha256').update('%PDF-new').digest('hex')).toBe(pdfHash);
  const url = 'https://media.wizards.com/2026/MagicCompRules20261001.pdf';
  await writeFile(join(research, 'inventory.json'), JSON.stringify({
    asset: [{ path: '/old/pdf/2026-10-01.pdf', version: '2026-10-01', format: 'pdf', sha256: '0'.repeat(64), bytes: 99 }],
    candidates: [{ path: 'downloads/current.pdf', version: '2026-10-01', format: 'pdf', sha256: pdfHash, bytes: 8,
      url, source: 'official', effective_dates: ['2026-10-01'], date_basis: 'document' }],
  }));
  await writeFile(join(research, 'official-overwrite-result.json'), JSON.stringify({ files: [{
    version: '2026-10-01', format: 'pdf', target: 'pdf/2026-10-01.pdf', source: 'downloads/current.pdf',
    url, effective_url: url, old_sha256: '0'.repeat(64), new_sha256: pdfHash,
  }] }));
  await writeFile(join(research, 'requests.json'), JSON.stringify([
    { path: 'downloads/current.pdf', url, effective_url: url, valid: true, http: '200', sha256: pdfHash, bytes: 8 },
    { path: 'downloads/current.txt', url: 'https://bad.test/login', effective_url: 'https://bad.test/login', valid: false,
      http: '200', sha256: txtHash, bytes: Buffer.byteLength(cr) },
  ]));
  const store = memoryStore();
  const result = await importExistingRules({ root, research, store, recordImport: async () => {} });
  expect(result.summary).toMatchObject({ imported: 1, failed: 0, skipped: 0 });
  expect(result.versions[0]?.uncertain).toContainEqual({ format: 'txt', reason: 'source_unconfirmed' });
  const page = await createRuleOperations({ root, store, recordImport: async () => {} }).read({});
  expect(page.files.find(file => file.format === 'pdf')).toMatchObject({ sourceUrl: url, effectiveUrl: url,
    sha256: pdfHash, size: 8, sourceKind: 'official', declaredEffectiveDate: '2026-10-01', dateBasis: 'document' });
  expect(page.files.find(file => file.format === 'txt')).toMatchObject({ sourceUrl: null, effectiveUrl: null, sha256: txtHash });
  const before = JSON.stringify(page.files);
  const retry = await importExistingRules({ root, research, store, recordImport: async () => {} });
  expect(retry.summary).toMatchObject({ imported: 0, skipped: 1, failed: 0 });
  expect(await store.revisions('magic-cr')).toHaveLength(1);
  expect(JSON.stringify((await createRuleOperations({ root, store, recordImport: async () => {} }).read({})).files)).toBe(before);
  expect((await store.revision((await store.releases('magic-cr'))[0]!.sourceRevisionId))?.meta?.ruleCount).toBe(1);
});

test('preflights existing rules without persisting content or attempts and reports missing TXT', async () => {
  const root = await archive();
  await mkdir(join(root, 'pdf'));
  await writeFile(join(root, 'pdf', '2026-09-01.pdf'), '%PDF-unknown');
  const store = memoryStore();
  const attempts: RuleImportAttempt[] = [];
  const report = await importExistingRules({ root, store, dryRun: true, recordImport: async attempt => { attempts.push(attempt); } });
  expect(report.mode).toBe('preflight');
  expect(report.summary).toMatchObject({ imported: 1, skipped: 1, failed: 0 });
  expect(report.versions[0]).toMatchObject({ version: '2026-09-01', status: 'skipped', reason: 'TXT source is unavailable' });
  expect(await store.documents()).toEqual([]);
  expect(await store.releases('magic-cr')).toEqual([]);
  expect(attempts).toEqual([]);
});

test('backfills existing translation statistics while retaining verified provenance and all content relationships', async () => {
  const root = await archive();
  const store = memoryStore();
  const rules = createRuleOperations({ root, store, recordImport: async () => {} });
  const imported = await rules.importVersion({ version: '2026-10-01', files: [{
    format: 'txt', language: 'en', sourceUrl: 'https://example.test/rules.txt',
    effectiveUrl: 'https://cdn.example.test/rules.txt',
  }] });
  const documents = createDocumentService(store, { track: 'local' });
  const translation = await documents.saveTranslation({ documentId: 'magic-cr', sourceRevisionId: imported.revisionId, language: 'zhs',
    nodes: [{ sourceNodeId: `${imported.revisionId}/100.1`, rawText: '支付 {W}。', translationMethod: 'human' }] });
  await documents.selectTranslation({ documentId: 'magic-cr', releaseId: imported.releaseId, revisionId: translation.id });
  await store.updateRevisionMeta(translation.id, {});
  const before = await store.revision(translation.id);
  const bindings = await store.releaseTranslations(imported.releaseId);
  const result = await importExistingRules({ root, store, recordImport: async () => {} });
  expect(result.summary.failed).toBe(0);
  expect((await store.revision(translation.id))?.meta).toMatchObject({ characterCount: 4, wordCount: 0, entryCount: 1 });
  expect((await store.revision(translation.id))?.nodes).toEqual(before?.nodes);
  expect(await store.releaseTranslations(imported.releaseId)).toEqual(bindings);
  expect((await rules.read({})).files[0]).toMatchObject({ sourceUrl: 'https://example.test/rules.txt', effectiveUrl: 'https://cdn.example.test/rules.txt' });
  await writeFile(join(root, 'txt', '2026-10-01.txt'), cr.replace('Pay {W} to continue.', 'Changed static rules.'));
  const failed = await importExistingRules({ root, store, recordImport: async () => {} });
  expect(failed.versions[0]).toMatchObject({ status: 'failed', reason: 'Official release already exists with different content' });
  expect((await rules.read({})).sections.find(node => node.nodeId === '100.1')?.text).toBe('Pay {W} to continue.');
  expect(await store.releaseTranslations(imported.releaseId)).toEqual(bindings);
  expect(await store.revisions('magic-cr')).toHaveLength(2);
});


test('publishes imported metadata without research files and leaves serving state unchanged until publication', async () => {
  const root = await archive();
  const research = await mkdtemp(join(tmpdir(), 'cr-serving-evidence-'));
  directories.push(research);
  const sha256 = '453352b1f6b4585ed373e28046f43b228ca30ac0b37c2c75421159beb8d0910d';
  const url = 'https://archive.example.test/2026-10-01.txt';
  await writeFile(join(research, 'inventory.json'), JSON.stringify({ candidates: [{
    path: 'downloads/rules.txt', url, source: 'archive', version: '2026-10-01', format: 'txt', sha256, bytes: 207,
    effective_dates: ['2026-10-01'], date_basis: 'document',
  }] }));
  // An unsuccessful request cannot establish the final download destination.
  await writeFile(join(research, 'requests.json'), JSON.stringify([{ path: 'downloads/rules.txt', url,
    effective_url: 'https://archive.example.test/login', valid: false, http: '404', sha256, bytes: 207 }]));
  const source = memoryStore();
  const target = memoryStore();
  const reader = createRuleReader(target, { assetBaseUrl: 'https://assets.example.test/' });
  const report = await importExistingRules({ root, research, store: source, recordImport: async () => {} });
  expect(report.versions[0]?.uncertain).toEqual([{ format: 'txt', reason: 'effective_url_unconfirmed' }]);
  expect(await reader.meta({ ruleId: 'magic-cr' })).toBeUndefined();
  await publishDocument(source, target, 'magic-cr', { dryRun: true });
  expect(await reader.meta({ ruleId: 'magic-cr' })).toBeUndefined();
  await rm(research, { recursive: true });
  await publishDocument(source, target, 'magic-cr');
  const metadata = await reader.meta({ ruleId: 'magic-cr' });
  expect(metadata).toMatchObject({ versionTag: '20261001', meta: { ruleCount: 1, entryCount: 5 }, files: [{
    format: 'txt', size: 207, sha256, sourceUrl: url, effectiveUrl: null,
    downloadUrl: 'https://assets.example.test/magic/rule/txt/2026-10-01.txt',
  }] });
  expect(JSON.stringify(metadata)).not.toContain(root);
  expect(JSON.stringify(metadata)).not.toContain('checkedAt');
  await publishDocument(source, target, 'magic-cr');
  expect(await reader.meta({ ruleId: 'magic-cr' })).toEqual(metadata);
  const bytes = await Bun.file(join(root, 'txt', '2026-10-01.txt')).arrayBuffer();
  expect(createHash('sha256').update(Buffer.from(bytes)).digest('hex')).toBe(sha256);
});

test('cross-checks fill records, ambiguous mirrors and overwrite mismatches without guessing provenance', async () => {
  const root = await archive();
  const research = await mkdtemp(join(tmpdir(), 'cr-cross-check-'));
  directories.push(research);
  const sha256 = '453352b1f6b4585ed373e28046f43b228ca30ac0b37c2c75421159beb8d0910d';
  const candidate = { path: 'downloads/original.txt', url: 'https://mirror.example.test/2026-10-01.txt', source: 'archive',
    version: '2026-10-01', format: 'txt', sha256, bytes: 207, effective_dates: ['2026-10-01'], date_basis: 'document' };
  const copy = { target: 'txt/2026-10-01.txt', version: '2026-10-01', format: 'txt', sha256, bytes: 207, downloads: [candidate] };
  const request = { path: candidate.path, url: candidate.url, effective_url: 'https://cdn.example.test/2026-10-01.txt',
    valid: true, http: '200', sha256, bytes: 207 };
  await writeFile(join(research, 'asset-fill-result.json'), JSON.stringify({ copies: [copy] }));
  await writeFile(join(research, 'requests.json'), JSON.stringify([request]));
  const imported = await importExistingRules({ root, research, store: memoryStore(), recordImport: async () => {} });
  expect(imported.versions[0]?.files[0]).toMatchObject({ sourceUrl: candidate.url, effectiveUrl: request.effective_url, filenameDate: '2026-10-01' });
  expect(imported.versions[0]?.uncertain).toEqual([]);

  await writeFile(join(research, 'inventory.json'), JSON.stringify({ candidates: [{ ...candidate,
    path: 'downloads/other.txt', url: 'https://other.example.test/rules.txt' }] }));
  const ambiguous = await importExistingRules({ root, research, store: memoryStore(), recordImport: async () => {} });
  expect(ambiguous.versions[0]?.files[0]?.sourceUrl).toBeNull();
  expect(ambiguous.versions[0]?.uncertain).toContainEqual({ format: 'txt', reason: 'conflicting_sources' });

  await writeFile(join(research, 'inventory.json'), JSON.stringify({ candidates: [{ ...candidate, version: null }] }));
  await writeFile(join(research, 'asset-fill-result.json'), JSON.stringify({ copies: [{ ...copy, sha256: '0'.repeat(64) }] }));
  const mismatch = await importExistingRules({ root, research, store: memoryStore(), recordImport: async () => {} });
  expect(mismatch.versions[0]?.files[0]?.sourceUrl).toBeNull();
  expect(mismatch.versions[0]?.uncertain).toContainEqual({ format: 'txt', reason: 'copy_mismatch' });
  await writeFile(join(research, 'official-overwrite-result.json'), JSON.stringify({ files: [{
    version: '2026-10-01', format: 'txt', target: 'txt/2026-10-01.txt', source: candidate.path,
    url: candidate.url, effective_url: request.effective_url, old_sha256: sha256, new_sha256: '1'.repeat(64),
  }] }));
  const overwritten = await importExistingRules({ root, research, store: memoryStore(), recordImport: async () => {} });
  expect(overwritten.versions[0]?.files[0]?.sourceUrl).toBeNull();
  expect(overwritten.versions[0]?.uncertain).toContainEqual({ format: 'txt', reason: 'overwrite_mismatch' });
  expect(await Bun.file(join(root, 'txt', '2026-10-01.txt')).text()).toBe(cr);
});

test('stops a batch when database capacity is exhausted without exposing driver diagnostics', async () => {
  const root = await archive();
  const store = memoryStore();
  // Database failures are external to the operation boundary and cannot be repaired per version.
  store.transaction = async () => {
    throw new Error('Failed query containing private parameters', { cause: Object.assign(new Error('private server path'), { code: '53100' }) });
  };
  const result = await importExistingRules({ root, store, versions: ['2026-10-01', '2026-11-01'], recordImport: async () => {} });
  expect(result.summary).toEqual({ imported: 0, skipped: 1, failed: 1, uncertain: 0 });
  expect(result.versions[0]?.reason).toBe('Local database storage is full');
  expect(result.versions[1]).toMatchObject({ status: 'skipped', reason: 'Batch stopped: Local database storage is full' });
  expect(JSON.stringify(result)).not.toContain('private');
  expect(await store.releases('magic-cr')).toEqual([]);
});


test('retains verified same-byte provenance when a later evidence bundle is incomplete', async () => {
  const root = await archive();
  const research = await mkdtemp(join(tmpdir(), 'cr-incomplete-evidence-'));
  directories.push(research);
  const store = memoryStore();
  const rules = createRuleOperations({ root, store, recordImport: async () => {} });
  const url = 'https://mirror.example.test/2026-10-01.txt';
  await rules.importVersion({ version: '2026-10-01', files: [{
    format: 'txt', language: 'en', sourceUrl: url, effectiveUrl: 'https://cdn.example.test/rules.txt',
    sourceKind: 'archive', originalFilename: 'original-2026-10-01.txt', filenameDate: '2026-10-01',
  }] });
  const before = (await rules.read({})).files;
  await writeFile(join(research, 'inventory.json'), JSON.stringify({ candidates: [{
    path: 'downloads/rules.txt', version: '2026-10-01', format: 'txt', url,
    sha256: '453352b1f6b4585ed373e28046f43b228ca30ac0b37c2c75421159beb8d0910d', bytes: 207,
  }] }));
  const report = await importExistingRules({ root, research, store, recordImport: async () => {} });
  expect((await rules.read({})).files).toEqual(before);
  expect(report.summary).toMatchObject({ imported: 0, skipped: 1, failed: 0 });
});

test('rejects an existing release with unproven saved dates and records rollback as a failed attempt', async () => {
  const root = await archive();
  const store = memoryStore();
  const rules = createRuleOperations({ root, store, recordImport: async () => {} });
  await rules.importVersion({ version: '2026-10-01' });
  const [release] = await store.releases('magic-cr');
  const saved = { ...release!, effectiveDate: null, publishedAt: new Date('2030-01-01T00:00:00Z') };
  await store.putRelease(saved);
  const attempts: RuleImportAttempt[] = [];
  const result = await importExistingRules({ root, store, recordImport: async attempt => { attempts.push(attempt); } });
  expect(result.versions[0]).toMatchObject({ status: 'failed', reason: 'Existing CR release date conflicts with retained source' });
  expect(await store.releases('magic-cr')).toEqual([saved]);
  expect(attempts.map(attempt => attempt.status)).toEqual(['processing', 'failed']);
  expect(attempts.at(-1)?.revisionId).toBeUndefined();
});

test('rejects undated historical TXT without leaving a release dated at import time', async () => {
  const root = await archive(cr.replace('These rules are effective as of October 1, 2026.', 'Historical edition.'));
  const store = memoryStore();
  const report = await importExistingRules({ root, store, recordImport: async () => {} });
  expect(report.versions[0]).toMatchObject({ status: 'failed', reason: 'Cannot verify the official CR effective date' });
  expect(await store.releases('magic-cr')).toEqual([]);
  expect(await store.revisions('magic-cr')).toEqual([]);
});

test('saves the historical official release address separately from the actual download source', async () => {
  const root = await archive();
  const research = await mkdtemp(join(tmpdir(), 'cr-official-url-'));
  directories.push(research);
  const officialUrl = 'https://media.wizards.com/2026/downloads/MagicCompRules%2020261001.txt';
  await writeFile(join(research, 'url-index-data-mapping.json'), JSON.stringify({ summary: {}, urls: [
    // A confirmed body date keys the address even when the index matched no local data file.
    { index: 1, url: officialUrl, available: true, http: '200', effective_date: '2026-10-01', data_files: [] },
    { index: 2, url: 'https://media.wizards.com/2026/downloads/MagicCompRules_20260901.txt', available: false,
      effective_date: '2026-09-01', data_files: ['/srv/research-data/magic/rule/2026-09-01.txt'] },
    { index: 3, url: 'http://www.wizards.com/dci/oracle/CompRuleBook-11-1-99.txt', available: false,
      effective_date: null, candidate_date: '1999-11-01', data_files: [] },
    { index: 4, url: 'https://mirror.example.test/rules/index.html', data_files: ['/srv/research-data/magic/rule/2026-10-01.txt'] },
    // Disagreeing dates, unknown extensions and unmapped entries never attach.
    { index: 5, url: 'https://media.wizards.com/2026/downloads/MagicCompRules_20261015.txt',
      effective_date: '2026-10-01', data_files: ['/srv/research-data/magic/rule/2026-09-01.txt'] },
  ] }));
  const source = memoryStore();
  const first = await importExistingRules({ root, research, store: source, recordImport: async () => {} });
  // The address is attached without any download evidence and without counting as unproven provenance.
  expect(first.summary).toMatchObject({ imported: 1, failed: 0 });
  expect(first.versions[0]?.files[0]).toMatchObject({ officialUrl, sourceUrl: null, effectiveUrl: null });
  expect(first.versions[0]?.uncertain).toEqual([{ format: 'txt', reason: 'source_unconfirmed' }]);
  expect(JSON.stringify(first)).not.toContain('/srv/research-data');

  const target = memoryStore();
  await publishDocument(source, target, 'magic-cr');
  const metadata = await createRuleReader(target, { assetBaseUrl: 'https://assets.example.test/' }).meta({ ruleId: 'magic-cr' });
  expect(metadata?.files[0]).toMatchObject({ officialUrl });
  expect(JSON.stringify(metadata)).not.toContain('/srv/research-data');

  // Repeat imports keep the address even when the historical reports are unavailable.
  const repeat = await importExistingRules({ root, store: source, recordImport: async () => {} });
  expect(repeat.summary).toMatchObject({ imported: 0, skipped: 1, failed: 0 });
  expect((await source.releases('magic-cr'))[0]?.files[0]?.officialUrl).toBe(officialUrl);

  // Two addresses for the same version and format stay unresolved instead of picking one.
  const ambiguousResearch = await mkdtemp(join(tmpdir(), 'cr-official-url-ambiguous-'));
  directories.push(ambiguousResearch);
  await writeFile(join(ambiguousResearch, 'url-index-data-mapping.json'), JSON.stringify({ urls: [
    { url: officialUrl, data_files: ['/srv/research-data/magic/rule/2026-10-01.txt'] },
    { url: 'http://www.wizards.com/magic/comprules/MagicCompRules_20261001.txt', data_files: ['/srv/research-data/magic/rule/2026-10-01.txt'] },
  ] }));
  const ambiguous = await importExistingRules({ root, research: ambiguousResearch, store: memoryStore(), recordImport: async () => {} });
  expect(ambiguous.versions[0]?.files[0]?.officialUrl == null).toBe(true);
});

test('keeps the saved revision when a retained TXT differs only in blank-line whitespace', async () => {
  const root = await archive();
  const store = memoryStore();
  const rules = createRuleOperations({ root, store, recordImport: async () => {} });
  const imported = await rules.importVersion({ version: '2026-10-01' });
  const documents = createDocumentService(store, { track: 'local' });
  const translation = await documents.saveTranslation({ documentId: 'magic-cr', sourceRevisionId: imported.revisionId, language: 'zhs',
    nodes: [{ sourceNodeId: `${imported.revisionId}/100.1`, rawText: '支付 {W}。', translationMethod: 'human' }] });
  await documents.selectTranslation({ documentId: 'magic-cr', releaseId: imported.releaseId, revisionId: translation.id });
  const bytes = await Bun.file(join(root, 'txt', '2026-10-01.txt')).text();
  await writeFile(join(root, 'txt', '2026-10-01.txt'), bytes.replace('\n\n100.1.', '\n \n100.1.'));
  const report = await importExistingRules({ root, store, recordImport: async () => {} });
  expect(report.versions[0]?.status).toBe('imported');
  expect(report.versions[0]?.files[0]?.sha256).not.toBe(createHash('sha256').update(bytes).digest('hex'));
  const [release] = await store.releases('magic-cr');
  expect(release?.sourceRevisionId).toBe(imported.revisionId);
  expect(await store.releaseTranslations(imported.releaseId)).toHaveLength(1);
  expect((await rules.read({})).sections.find(node => node.nodeId === '100.1')?.text).toBe('Pay {W} to continue.');
});
