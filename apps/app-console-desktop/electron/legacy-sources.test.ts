import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { legacySources } from './legacy-sources.ts';

const execute = promisify(execFile);

for (const username of ['legacy-test-user', '用户']) {
  test(`reads the WebKit username ${username} and legacy files without changing them or touching a real keychain`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'console-legacy-'));
    try {
      const webKitRoot = join(root, 'WebsiteData');
      const directory = join(webKitRoot, 'Default', 'origin-hash', 'partition-hash', 'LocalStorage');
      await mkdir(directory, { recursive: true });
      const database = join(directory, 'localstorage.sqlite3');
      const hex = Buffer.from(username, 'utf16le').toString('hex');
      await execute('/usr/bin/sqlite3', [
        database,
        `CREATE TABLE ItemTable (key TEXT, value BLOB); INSERT INTO ItemTable VALUES ('console-desktop-username', x'${hex}');`,
      ]);
      await writeFile(join(root, 'desktop-config.json'), '{"version":1}');
      const before = await readFile(database);
      const source = legacySources(false, {
        configRoot: root,
        webKitRoot,
        async credential(account) {
          assert.equal(account, username);
          return 'fixture-password';
        },
      });
      assert.equal(await source.config(), '{"version":1}');
      assert.deepEqual(await source.login(), { username, password: 'fixture-password' });
      assert.deepEqual(await readFile(database), before);
      assert.equal(await readFile(join(root, 'desktop-config.json'), 'utf8'), '{"version":1}');
      assert.equal(await source.session(), null);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
