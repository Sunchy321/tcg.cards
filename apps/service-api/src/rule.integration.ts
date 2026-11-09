import { expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';

import { createDocumentService } from '@tcg-cards/console-api/lib/magic/documents/service';
import { memoryStore } from '@tcg-cards/console-api/lib/magic/documents/testing';
import { publishDocument } from '@tcg-cards/console-api/lib/magic/documents/publish';
import type { RuleContent, RuleMetadata, RuleVersion } from '@tcg-cards/model/magic/schema/rule-api';

const source = memoryStore();
const target = memoryStore();
mock.module('@tcg-cards/console-api/lib/magic/documents/database', () => ({ createDocumentStore: () => target }));
mock.module('@tcg-cards/db', () => ({ db: {}, createDb: () => ({}), runWithDb: (_db: unknown, operation: () => unknown) => operation() }));
mock.module('./auth', () => ({
  getAuth: () => ({ api: {
    verifyApiKey: async ({ body }: { body: { key: string, permissions?: { allowedGames: string[] } } }) => {
      if (body.key !== 'magic-key' || body.permissions?.allowedGames[0] !== 'magic') return { error: { code: 'KEY_DISABLED', message: 'Game access denied' } };
      return { error: null };
    },
  } }),
}));

// Load the real worker only after replacing its external database and auth boundaries.
const { default: app } = await import('./index');
const env = { BETTER_AUTH_SECRET: 'test', HYPERDRIVE: { connectionString: 'postgres://unused.test/test' } };
const content = `Magic: The Gathering Comprehensive Rules

These rules are effective as of October 1, 2026.

Introduction

Hi.

Contents

Credits

1. Basics

100. General

100.1. Pay {W}.
`;

/** Sends requests through the production worker, auth middleware and OpenAPI handler. */
function request(path: string, key: string | null = 'magic-key', assetBaseUrl?: string) {
  return app.fetch(new Request(`https://api.example.test${path}`, {
    headers: key == null ? {} : { authorization: `Bearer ${key}` },
  }), { ...env, ASSET_BASE_URL: assetBaseUrl });
}

test('serves only published rule statistics through the metadata and discovery endpoints', async () => {
  const documents = createDocumentService(source, { track: 'local' });
  await documents.importCr({ content });
  expect((await request('/v1/magic/rule/meta?ruleId=magic-cr')).status).toBe(404);
  await publishDocument(source, target, 'magic-cr');
  const listing = await request('/v1/magic/rule/list');
  expect(listing.status).toBe(200);
  expect(await listing.json()).toEqual([{ id: 'magic-cr', title: 'Comprehensive Rules', sourceLanguage: 'en' }]);
  const response = await request('/v1/magic/rule/meta?ruleId=magic-cr');
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    ruleId:     'magic-cr',
    versionTag: '20261001',
    language:   'en',
    meta:       { chapterCount: 1, ruleCount: 1, entryCount: 5 },
    files:      [],
  });
});

test('selects exact published versions and languages without borrowing source statistics', async () => {
  const documents = createDocumentService(source, { track: 'local' });
  const imported = await documents.importCr({ content: content.replace('October 1', 'November 1') });
  const translated = await documents.saveTranslation({
    documentId:       imported.documentId,
    sourceRevisionId: imported.revisionId,
    language:         'zhs',
    nodes:            [{
      sourceNodeId:      `${imported.revisionId}/100.1`,
      rawText:           '支付 {W/U}，别停！😀',
      translationMethod: 'human',
    }],
  });
  await documents.selectTranslation({ documentId: imported.documentId, releaseId: imported.releaseId, revisionId: translated.id });
  await publishDocument(source, target, 'magic-cr');
  const response = await request('/v1/magic/rule/meta?ruleId=magic-cr&language=zhs');
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    versionTag: '20261101',
    language:   'zhs',
    revisionId: translated.id,
    meta:       { characterCount: 8, wordCount: 0, entryCount: 1, ruleCount: 1 },
  });
  const original = await request('/v1/magic/rule/meta?ruleId=magic-cr&versionTag=20261001');
  expect(await original.json()).toMatchObject({ versionTag: '20261001', language: 'en' });
  const versions = await request('/v1/magic/rule/versions?ruleId=magic-cr');
  expect(versions.status).toBe(200);
  const rows = await versions.json() as RuleVersion[];
  expect(rows.map(row => ({ versionTag: row.versionTag, languages: row.languages }))).toEqual([
    { versionTag: '20261101', languages: ['en', 'zhs'] },
    { versionTag: '20261001', languages: ['en'] },
  ]);
  for (const suffix of ['&language=fr', '&versionTag=missing', '&versionTag=20261001&language=zhs']) {
    expect((await request(`/v1/magic/rule/meta?ruleId=magic-cr${suffix}`)).status).toBe(404);
  }
  expect((await request('/v1/magic/rule/meta?ruleId=unknown')).status).toBe(404);
  expect((await request('/v1/magic/rule/versions?ruleId=unknown')).status).toBe(404);
});

test('returns unknown legacy statistics and publishes backfills only through document publication', async () => {
  const documents = createDocumentService(source, { track: 'local' });
  const imported = await documents.importCr({ content });
  await target.updateRevisionMeta(imported.revisionId, {});
  const path = '/v1/magic/rule/meta?ruleId=magic-cr&versionTag=20261001';
  expect((await (await request(path)).json() as RuleMetadata).meta).toEqual({});
  await source.updateRevisionMeta(imported.revisionId, {});
  await documents.importCr({ content });
  await publishDocument(source, target, 'magic-cr', { dryRun: true });
  expect((await (await request(path)).json() as RuleMetadata).meta).toEqual({});
  await publishDocument(source, target, 'magic-cr');
  const response = await request(path);
  const published = await response.json() as RuleMetadata;
  expect(published.meta?.ruleCount).toBe(1);
  await publishDocument(source, target, 'magic-cr');
  expect(await (await request(path)).json()).toEqual(published);
});

test('returns only public file descriptors and excludes retired releases and arbitrary user articles', async () => {
  const documents = createDocumentService(source, { track: 'local' });
  await documents.importCr({ content, files: [{ format: 'txt', language: 'en', storageKey: '/private/internal/source.txt', sourceUrl: 'https://media.example.test/rules.txt' }] });
  await publishDocument(source, target, 'magic-cr');
  const response = await request('/v1/magic/rule/meta?ruleId=magic-cr&versionTag=20261001');
  const body = await response.text();
  expect(body).toContain('https://media.example.test/rules.txt');
  expect(body).not.toContain('/private/internal');
  expect(body).not.toContain('storageKey');
  await documents.retireRelease({ documentId: 'magic-cr', releaseId: 'magic-cr:20261001' });
  await publishDocument(source, target, 'magic-cr');
  expect((await request('/v1/magic/rule/meta?ruleId=magic-cr&versionTag=20261001')).status).toBe(404);
  const versions = await (await request('/v1/magic/rule/versions?ruleId=magic-cr')).json() as RuleVersion[];
  expect(versions.map(row => row.versionTag)).toEqual(['20261101']);
  const owner = createDocumentService(target, { track: 'remote', actorId: 'alice' });
  const article = await owner.create({ slug: 'other-rules', title: 'Private rules', language: 'en' });
  expect((await request(`/v1/magic/rule/meta?ruleId=${article.id}`)).status).toBe(404);
  expect(await (await request('/v1/magic/rule/list')).json()).toEqual([{ id: 'magic-cr', title: 'Comprehensive Rules', sourceLanguage: 'en' }]);
});

test('enforces existing API key and game permissions and describes the routes in OpenAPI', async () => {
  for (const route of ['list', 'versions?ruleId=magic-cr', 'meta?ruleId=magic-cr', 'text?ruleId=magic-cr', 'content?ruleId=magic-cr']) {
    expect((await request(`/v1/magic/rule/${route}`, null)).status).toBe(401);
    expect((await request(`/v1/magic/rule/${route}`, 'hearthstone-key')).status).toBe(403);
  }
  expect((await request('/v1/magic/rule/meta')).status).toBe(400);
  const spec = await request('/openapi.json', null);
  expect(spec.status).toBe(200);
  const document = await spec.json() as { paths: Record<string, { get?: { description?: string, responses: Record<string, { content?: Record<string, unknown> }> } }> };
  for (const route of ['list', 'versions', 'meta', 'text', 'content']) expect(document.paths[`/magic/rule/${route}`]?.get).toBeDefined();
  expect(document.paths['/magic/rule/text']?.get?.responses['200']?.content).toHaveProperty('text/plain');
  expect(document.paths['/magic/rule/text']?.get?.responses['200']?.content).not.toHaveProperty('application/json');
  expect(document.paths['/magic/rule/content']?.get?.responses['200']?.content).toHaveProperty('application/json');
  expect(document.paths['/magic/rule/meta']?.get?.description).toContain('one character per complete game symbol');
  expect((await request('/magic/rule/meta?ruleId=magic-cr')).status).toBe(200);
});

test('resolves published R2 keys per application and downloads all formats with matching original hashes', async () => {
  const originalContent = content.replace('October 1', 'December 1');
  const samples = [
    { format: 'txt' as const, storageKey: 'magic/rule/txt/2026-12-01.txt', bytes: Buffer.from(`\uFEFF${originalContent.replaceAll('\n', '\r\n')}`) },
    { format: 'pdf' as const, storageKey: 'magic/rule/pdf/2026-12-01 rules #1.pdf', bytes: Buffer.from('%PDF-1.7\noriginal') },
    { format: 'doc' as const, storageKey: 'magic/rule/doc/2026-12-01.doc', bytes: Buffer.from('d0cf11e0a1b11ae1', 'hex') },
    { format: 'docx' as const, storageKey: 'magic/rule/doc/2026-12-01.docx', bytes: Buffer.from('504b0304', 'hex') },
    { format: 'rtf' as const, storageKey: 'magic/rule/rtf/2026-12-01.rtf', bytes: Buffer.from('{\\rtf1 original}') },
  ];
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch(req) {
      const key = decodeURIComponent(new URL(req.url).pathname.slice(1));
      const sample = samples.find(item => item.storageKey === key);
      return sample ? new Response(sample.bytes) : new Response(null, { status: 404 });
    },
  });
  try {
    const documents = createDocumentService(source, { track: 'local' });
    const files = samples.map(sample => ({
      format:           sample.format,
      language:         'en',
      storageKey:       sample.storageKey,
      sha256:           createHash('sha256').update(sample.bytes).digest('hex'),
      size:             sample.bytes.length,
      sourceUrl:        'https://media.example.test/original',
      effectiveUrl:     'https://cdn.example.test/original',
      originalFilename: 'Comprehensive Rules',
      sourceKind:       'official',
      publisher:        'Wizards of the Coast',
      pageCount:        null,
      encoding:         sample.format === 'txt' ? 'utf-8' : null,
    }));
    await documents.importCr({ content: originalContent, files });
    await publishDocument(source, target, 'magic-cr');
    const path = '/v1/magic/rule/meta?ruleId=magic-cr&versionTag=20261201';
    const base = server.url.toString();
    const [response, otherResponse] = await Promise.all([
      request(path, 'magic-key', base), request(path, 'magic-key', 'https://other-assets.example.test/static/'),
    ]);
    expect(response.status).toBe(200);
    expect(otherResponse.status).toBe(200);
    const metadata = await response.json() as RuleMetadata;
    const other = await otherResponse.json() as RuleMetadata;
    expect(metadata.files).toHaveLength(5);
    for (const file of metadata.files) {
      expect(file.downloadUrl).toStartWith(base);
      expect(file.sourceUrl).toBe('https://media.example.test/original');
      expect(file.effectiveUrl).toBe('https://cdn.example.test/original');
      expect(other.files.find(item => item.format === file.format)?.downloadUrl).toStartWith('https://other-assets.example.test/static/');
      const download = await fetch(file.downloadUrl!);
      expect(download.status).toBe(200);
      const bytes = Buffer.from(await download.arrayBuffer());
      expect(file.size).toBe(bytes.length);
      expect(file.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
      expect(file).not.toHaveProperty('storageKey');
    }
    const saved = (await target.releases('magic-cr')).find(row => row.versionTag === '20261201')!;
    expect(saved.files).toEqual(files);
    expect(saved.files.every(file => !('downloadUrl' in file))).toBe(true);
  } finally {
    await server.stop(true);
  }
});

test('reads one published body as real plain text and ordered structured JSON', async () => {
  const documents = createDocumentService(source, { track: 'local' });
  const imported = await documents.importCr({ content: content.replace('October 1, 2026', 'January 1, 2027') + '\n100.1a. Say **hello**.\n' });
  const path = '?ruleId=magic-cr&versionTag=20270101';
  for (const route of ['text', 'content']) expect((await request(`/v1/magic/rule/${route}${path}`)).status).toBe(404);
  await publishDocument(source, target, 'magic-cr');
  const response = await request(`/v1/magic/rule/text${path}`);
  expect(response.status, response.status === 200 ? '' : await response.clone().text()).toBe(200);
  expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
  expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from('Introduction\n\nHi.\n\n1. Basics\n\n100. General\n\n100.1. Pay {W}.\n\n100.1a. Say hello.'));
  const structured = await request('/v1/magic/rule/content?ruleId=magic-cr');
  expect(structured.status).toBe(200);
  expect(structured.headers.get('content-type')).toContain('application/json');
  const body = await structured.json() as RuleContent;
  expect(body).toMatchObject({ ruleId: 'magic-cr', versionTag: '20270101', revisionId: imported.revisionId, language: 'en' });
  expect(body.nodes.map(node => node.anchor)).toEqual(['intro', 'intro.content', '1', '100', '100.1', '100.1a']);
  expect(body.nodes[5]).toMatchObject({ anchor: '100.1a', parentKey: body.nodes[4]!.nodeKey, level: 3, order: 5, rawText: 'Say hello.', markers: [{ type: 'emphasis', style: 'strong', start: 4, end: 9 }] });
  const metadata = await (await request(`/v1/magic/rule/meta${path}`)).json() as RuleMetadata;
  expect(body.revisionId).toBe(metadata.revisionId);
  expect(body.language).toBe(metadata.language);
  expect(body.nodes).toHaveLength(metadata.meta.entryCount!);
});

test('reads only selected translations in source order and rejects missing or hidden content', async () => {
  const documents = createDocumentService(source, { track: 'local' });
  const imported = await documents.importCr({ content: content.replace('October 1, 2026', 'February 1, 2027') + '\n100.2. Second rule.\n\n100.10. Tenth rule.\n' });
  const translated = await documents.saveTranslation({
    documentId:       imported.documentId, sourceRevisionId: imported.revisionId, language:         'zhs',
    // Saved order and sibling numbers alone cannot determine full document order.
    nodes:            [
      { sourceNodeId: `${imported.revisionId}/100.10`, rawText: '第十条 😀', translationMethod: 'human' },
      { sourceNodeId: `${imported.revisionId}/100.2`, rawText: '第二条 {W/U}', translationMethod: 'human' },
    ],
  });
  await documents.selectTranslation({ documentId: imported.documentId, releaseId: imported.releaseId, revisionId: translated.id });
  await documents.saveTranslation({
    documentId:       imported.documentId, sourceRevisionId: imported.revisionId, language:         'zhs',
    nodes:            [{ sourceNodeId: `${imported.revisionId}/100.2`, rawText: 'UNSELECTED', translationMethod: 'human' }],
  });
  await publishDocument(source, target, 'magic-cr');
  const suffix = '?ruleId=magic-cr&versionTag=20270201&language=zhs';
  const metadata = await (await request(`/v1/magic/rule/meta${suffix}`)).json() as RuleMetadata;
  const body = await (await request(`/v1/magic/rule/content${suffix}`)).json() as RuleContent;
  expect(body.revisionId).toBe(translated.id);
  expect(body.revisionId).toBe(metadata.revisionId);
  expect(body.language).toBe(metadata.language);
  expect(body.nodes).toHaveLength(metadata.meta.entryCount!);
  expect(body.nodes.map(node => ({ anchor: node.anchor, rawText: node.rawText, level: node.level, order: node.order }))).toEqual([
    { anchor: '100.2', rawText: '第二条 {W/U}', level: 2, order: 0 },
    { anchor: '100.10', rawText: '第十条 😀', level: 2, order: 1 },
  ]);
  const original = await (await request('/v1/magic/rule/content?ruleId=magic-cr')).json() as RuleContent;
  const parent = original.nodes.find(node => node.anchor === '100')!;
  expect(body.nodes.map(node => node.parentKey)).toEqual([parent.nodeKey, parent.nodeKey]);
  const text = await request(`/v1/magic/rule/text${suffix}`);
  expect(Buffer.from(await text.arrayBuffer())).toEqual(Buffer.from('100.2. 第二条 {W/U}\n\n100.10. 第十条 😀'));
  const originalText = await (await request('/magic/rule/text?ruleId=magic-cr')).text();
  expect(originalText).toContain('100.2. Second rule.\n\n100.10. Tenth rule.');
  const historical = await (await request('/v1/magic/rule/content?ruleId=magic-cr&versionTag=20261101&language=zhs')).json() as RuleContent;
  expect(historical.versionTag).toBe('20261101');
  expect(historical.nodes.map(node => node.rawText)).toEqual(['支付 {W/U}，别停！😀']);
  for (const route of ['text', 'content']) {
    for (const query of ['ruleId=unknown', 'ruleId=magic-cr&versionTag=missing', 'ruleId=magic-cr&language=fr', 'ruleId=magic-cr&versionTag=20270101&language=zhs', `ruleId=magic-cr&versionTag=${imported.revisionId}`]) {
      expect((await request(`/v1/magic/rule/${route}?${query}`)).status).toBe(404);
    }
    expect((await request(`/v1/magic/rule/${route}`)).status).toBe(400);
  }
  const document = (await target.document('magic-cr'))!;
  await target.putDocument({ ...document, visibility: 'private' });
  for (const route of ['text', 'content']) expect((await request(`/v1/magic/rule/${route}${suffix}`)).status).toBe(404);
  await target.putDocument(document);
  await documents.retireRelease({ documentId: imported.documentId, releaseId: imported.releaseId });
  await publishDocument(source, target, 'magic-cr');
  for (const route of ['text', 'content']) expect((await request(`/v1/magic/rule/${route}${suffix}`)).status).toBe(404);
});
