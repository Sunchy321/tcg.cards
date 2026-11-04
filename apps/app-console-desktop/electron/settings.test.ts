import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Settings } from './settings.ts';

/** Isolates persistence and encryption at the configuration service boundary. */
function fixture() {
  let data: Record<string, unknown> = {};
  const storage = {
    read:  () => structuredClone(data),
    write: (value: Record<string, unknown>) => {
      data = structuredClone(value);
    },
  };
  const cipher = {
    async encrypt(value: string) {
      return Buffer.from(`encrypted:${value}`).toString('base64');
    },
    async decrypt(value: string) {
      return Buffer.from(value, 'base64').toString().slice(10);
    },
  };
  return { service: new Settings(storage, cipher), storage, cipher };
}

test('a configuration from the retired per-game publish model still loads with those keys ignored', () => {
  const cipher = {
    async encrypt(value: string) { return value; },
    async decrypt(value: string) { return value; },
  };
  const service = new Settings({
    read: () => ({
      config: {
        version: 1,
        publish: [{ credentialKey: 'ae313789-9cfb-4d20-abde-41fefbd92814', publishTarget: 'magic', environment: 'prod' }],
        games:   { yugioh: { publish: { publishTargetId: 'yugioh-test', environment: 'test', targetFingerprint: 'x' } } },
      },
      secrets:   { 'publish:ae313789-9cfb-4d20-abde-41fefbd92814': 'sealed' },
      migration: [],
      inherited: false,
      revision:  3,
    }),
    write: () => {},
  }, cipher);

  assert.deepEqual(service.snapshot().config.targets, []);
  assert.equal((service.snapshot().config.games.yugioh as Record<string, unknown> | undefined)?.publish, undefined);
  assert.equal(service.snapshot().revision, 3);
});

test('ordinary edits persist while rejected JSON leaves settings and credentials intact', async () => {
  const { service, storage, cipher } = fixture();
  await service.update('database', 'postgres://user:secret@localhost/cards');
  await service.setSecret('ai', 'private-api-key');
  await service.update('ai.model', 'example-model');
  const before = service.snapshot();
  assert.equal(JSON.stringify(before).includes('private-api-key'), false);
  await assert.rejects(service.saveJson('{"unexpected":true}', before.revision), /配置/);
  assert.deepEqual(service.snapshot(), before);
  const publicConfig = { ...before.config, ai: { model: 'another-model' } };
  await service.saveJson(JSON.stringify(publicConfig), before.revision);
  const reopened = new Settings(storage, cipher);
  assert.equal(reopened.snapshot().config.ai?.model, 'another-model');
  assert.equal(reopened.snapshot().config.database, 'postgres://user:secret@localhost/cards');
  assert.equal(await reopened.secret('ai'), 'private-api-key');
});

test('running tasks retain a snapshot and failed encryption cannot persist plaintext', async () => {
  const { service, storage } = fixture();
  await service.update('paths.data', '/tmp/first');
  const running = service.snapshot();
  await service.update('paths.data', '/tmp/next');
  assert.equal(running.config.paths.data, '/tmp/first');
  assert.equal(service.snapshot().config.paths.data, '/tmp/next');
  const blocked = new Settings(storage, {
    async encrypt() {
      throw new Error('secret detail');
    },
    async decrypt() {
      throw new Error();
    },
  });
  const before = storage.read();
  await assert.rejects(
    blocked.setSecret('ai', 'private-api-key'),
    error => error instanceof Error && !error.message.includes('secret detail'),
  );
  assert.deepEqual(storage.read(), before);
  assert.equal(JSON.stringify(storage.read()).includes('private-api-key'), false);
});

test('strict JSON rejects unknown nested fields, credentials, invalid URLs and paths', async () => {
  const { service } = fixture();
  for (const input of [
    [],
    { version: 1, ai: { apiKey: 'must-not-save' } },
    { version: 1, ai: { baseUrl: 'ftp://example.com' } },
    { version: 1, ai: { baseUrl: 'not-a-url' } },
    { version: 1, paths: { arbitrary: '/tmp/data' } },
    { version: 1, paths: { data: 'relative/path' } },
  ]) {
    const before = service.snapshot();
    await assert.rejects(service.saveJson(JSON.stringify(input), before.revision));
    assert.deepEqual(service.snapshot(), before);
  }
  await service.update('ai.model', 'newer');
  await assert.rejects(service.saveJson('{"version":1}', 0), /变化/);
});

test('editing a publish target invalidates its previously verified destination', async () => {
  const { service } = fixture();
  const id = 'ae313789-9cfb-4d20-abde-41fefbd92814';
  await service.update('targets', [
    { id, name: '本地', kind: 'direct', connectionString: 'postgres://me:old@localhost/old', targetFingerprint: 'old-destination' },
  ]);
  assert.equal(service.snapshot().config.targets[0]?.targetFingerprint, 'old-destination');
  await service.update('targets', [
    { id, name: '本地', kind: 'direct', connectionString: 'postgres://me:new-password@localhost/new-target', targetFingerprint: 'old-destination' },
  ]);
  assert.equal(service.snapshot().config.targets[0]?.targetFingerprint, undefined);
  await service.update('targets', [
    { id, name: '线上', kind: 'direct', connectionString: 'postgres://me:new-password@localhost/new-target', targetFingerprint: 'old-destination' },
  ]);
  assert.equal(service.snapshot().config.targets[0]?.targetFingerprint, undefined);
});
