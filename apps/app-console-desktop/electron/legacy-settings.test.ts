import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Settings } from './settings.ts';
import { inheritSettings } from './legacy-settings.ts';

test('inherits plaintext and Keychain secrets once without overwriting new settings', async () => {
  let data: Record<string, unknown> = {};
  const service = new Settings({ read: () => data, write: value => { data = value; } }, {
    async encrypt(value) { return Buffer.from(`sealed:${value}`).toString('base64'); },
    async decrypt(value) { return Buffer.from(value, 'base64').toString().slice(7); },
  });
  const key = 'ae313789-9cfb-4d20-abde-41fefbd92814';
  const legacy = JSON.stringify({ version: 1, externalDatabaseConnectionString: 'postgres://me:oldpass@localhost/old', ai: { apiKey: 'old-key', model: 'old-model' }, paths: { data: '/tmp/old', magic: { data: { scryfall: '/tmp/cards' } } }, publish: [{ credentialKey: key, publishTarget: 'magic', environment: 'prod', targetFingerprint: 'verified-old-target' }] });
  const sources = { async config() { return legacy; }, async credential(account: string) { return account === `publish-target:${key}` ? 'postgres://me:remote@localhost/publish' : null; }, async session() { return null; }, async login() { return null; } };
  await inheritSettings(service, sources);
  assert.equal(await service.secret('database'), 'postgres://me:oldpass@localhost/old');
  assert.equal(await service.secret(`publish:${key}`), 'postgres://me:remote@localhost/publish');
  assert.equal(service.snapshot().config.publish[0]?.targetFingerprint, 'verified-old-target');
  assert.equal(service.snapshot().config.paths['magic.data.scryfall'], '/tmp/cards');
  assert.equal(JSON.stringify(data).includes('oldpass'), false);
  assert.equal(JSON.stringify(service.snapshot()).includes('old-key'), false);
  await service.update('ai.model', 'new-model');
  await inheritSettings(service, sources);
  assert.equal(service.snapshot().config.ai.model, 'new-model');
});

test('partial legacy failures are reported without preventing valid fields or exposing secrets', async () => {
  let data: Record<string, unknown> = {};
  const service = new Settings({ read: () => data, write: value => { data = value; } }, {
    async encrypt() { throw new Error('private-api-key must never appear'); },
    async decrypt() { throw new Error(); },
  });
  let reads = 0;
  const sources = {
    async config() { reads++; return JSON.stringify({ version: 1, paths: { data: '/tmp/valid', asset: 'relative' }, ai: { apiKey: 'private-api-key', model: 'valid-model' } }); },
    async credential() { throw new Error('private-password'); },
    async session() { return '{broken'; },
    async login() { throw new Error('private-password'); },
  };
  await inheritSettings(service, sources);
  assert.equal(service.snapshot().config.paths.data, '/tmp/valid');
  assert.equal(service.snapshot().config.paths.asset, undefined);
  assert.equal(service.snapshot().config.ai.model, 'valid-model');
  assert.ok(service.snapshot().migration.some(item => item.label === '模型密钥' && item.status === 'failed'));
  assert.ok(service.snapshot().migration.some(item => item.label === '登录凭据' && item.status === 'failed'));
  assert.equal(JSON.stringify(data).includes('private-'), false);
  await service.update('ai.model', 'user-replacement');
  await inheritSettings(service, sources);
  assert.equal(reads, 1);
  assert.equal(service.snapshot().config.ai.model, 'user-replacement');
});

test('malformed legacy JSON produces a report and never clears existing settings', async () => {
  let data: Record<string, unknown> = {};
  const service = new Settings({ read: () => data, write: value => { data = value; } }, {
    async encrypt(value) { return Buffer.from(value).toString('base64'); },
    async decrypt(value) { return Buffer.from(value, 'base64').toString(); },
  });
  await service.update('paths.data', '/tmp/new-data');
  await inheritSettings(service, { async config() { return '{broken'; }, async credential() { return null; }, async session() { return null; }, async login() { return null; } });
  assert.equal(service.snapshot().config.paths.data, '/tmp/new-data');
  assert.ok(service.snapshot().migration.some(item => item.label === '旧设置文件' && item.status === 'failed'));
});

test('malformed legacy sections report their category instead of silently inheriting an empty value', async () => {
  let data: Record<string, unknown> = {};
  const service = new Settings({ read: () => data, write: value => { data = value; } }, {
    async encrypt(value) { return Buffer.from(value).toString('base64'); },
    async decrypt(value) { return Buffer.from(value, 'base64').toString(); },
  });
  await inheritSettings(service, { async config() { return JSON.stringify({ version: 1, ai: 'broken', paths: [], publish: {}, games: { hearthstone: { image: 'broken' } } }); }, async credential() { return null; }, async session() { return null; }, async login() { return null; } });
  for (const label of ['模型配置', '数据目录', '发布连接设置', '游戏设置']) {
    assert.ok(service.snapshot().migration.some(item => item.label === label && item.status === 'failed'));
  }
});
