import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { LegacySources } from './legacy-settings';

const execute = promisify(execFile);
const identifier = 'cards.tcg.console-desktop';
/** Reads a legacy file without creating or changing it. */
async function optionalFile(file: string) {
  try { return await readFile(file, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new Error('无法读取旧设置。'); }
}
/** Reads exactly one account from the old service without logging command output. */
async function credential(account: string): Promise<string | null> {
  try {
    const result = await execute('/usr/bin/security', ['find-generic-password', '-s', 'tcg-cards-console-desktop', '-a', account, '-w'], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    return result.stdout.replace(/\r?\n$/, '');
  } catch (error) {
    if ((error as { code?: number }).code === 44) return null;
    throw new Error('无法读取旧凭据。');
  }
}
/** Finds both historical flat storage and current WebKit per-origin storage files. */
async function login(root: string, readCredential: (account: string) => Promise<string | null>): Promise<{ username: string; password: string } | null> {
  const pending = [{ path: root, depth: 0 }];
  let visited = 0;
  let failed = false;
  while (pending.length) {
    const current = pending.shift()!;
    if (++visited > 256) { failed = true; break; }
    let files;
    try { files = await readdir(current.path, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failed = true; continue; }
    for (const file of files) {
      const path = join(current.path, file.name);
      if (file.isDirectory() && !['CacheStorage', 'IndexedDB', 'NetworkCache', 'MediaCache', 'ServiceWorkers'].includes(file.name)) {
        if (current.depth >= 10) { failed = true; continue; }
        pending.push({ path, depth: current.depth + 1 });
      }
      if (!file.isFile() || !(file.name.endsWith('.localstorage') || file.name.toLowerCase() === 'localstorage.sqlite3')) continue;
      try {
        const result = await execute('/usr/bin/sqlite3', ['-readonly', path, "SELECT typeof(value) || ':' || hex(value) FROM ItemTable WHERE key = 'console-desktop-username' LIMIT 1;"], { timeout: 5000 });
        const encoded = /^(blob|text):([a-f0-9]+)$/i.exec(result.stdout.trim());
        if (!encoded) continue;
        const bytes = Buffer.from(encoded[2]!, 'hex');
        // WebKit stores strings as UTF-16LE blobs; SQLite text values use UTF-8.
        const username = bytes.toString(encoded[1] === 'blob' ? 'utf16le' : 'utf8');
        if (!username || username.includes('\0')) continue;
        const password = await readCredential(username);
        if (password !== null) return { username, password };
      } catch { failed = true; }
    }
  }
  if (failed) throw new Error('无法完整读取旧登录信息。');
  return null;
}
/** Isolated filesystem and keychain ports used by legacy-source integration tests. */
interface LegacyLocations {
  configRoot?: string;
  webKitRoot?: string;
  credential?: (account: string) => Promise<string | null>;
}
/** Creates read-only sources, disabled for isolated automated application tests. */
export function legacySources(isolated: boolean, locations: LegacyLocations = {}): LegacySources {
  const root = locations.configRoot ?? join(homedir(), 'Library/Application Support', identifier);
  if (isolated) return { async config() { return null; }, async credential() { return null; }, async session() { return null; }, async login() { return null; } };
  const readCredential = locations.credential ?? credential;
  const webKitRoot = locations.webKitRoot ?? join(homedir(), 'Library/WebKit', identifier, 'WebsiteData');
  return { config: () => optionalFile(join(root, 'desktop-config.json')), session: () => optionalFile(join(root, 'auth-session.json')), credential: readCredential, login: () => login(webKitRoot, readCredential) };
}
