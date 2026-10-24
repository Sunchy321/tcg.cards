import { randomUUID } from 'node:crypto';
import { pathKeys } from '../shared/settings.ts';
import type { MigrationItem } from '../shared/settings.ts';
import type { Settings } from './settings.ts';

/** Read-only legacy sources; tests provide temporary fixtures instead of real secrets. */
export interface LegacySources {
  config(): Promise<string | null>;
  credential(account: string): Promise<string | null>;
  session(): Promise<string | null>;
  login(): Promise<{ username: string, password: string } | null>;
}
/** Reads an object without accepting arrays or inherited property lookups. */
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
/** Attempts each legacy category independently and never overwrites user edits on restart. */
export async function inheritSettings(settings: Settings, source: LegacySources) {
  if (settings.hasInherited()) return;
  const report: MigrationItem[] = [];
  /** Reports product categories without including paths, values or exception payloads. */
  async function attempt(label: string, action: () => Promise<unknown>) {
    try {
      const result = await action();
      report.push({ label, status: result === null ? 'missing' : 'imported' });
    } catch {
      report.push({ label, status: 'failed' });
    }
  }
  let legacy: Record<string, unknown> = {};
  await attempt('旧设置文件', async () => {
    const text = await source.config();
    if (text === null) return null;
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    legacy = object(value);
    if (legacy.version !== undefined && legacy.version !== 1) {
      legacy = {};
      throw new Error();
    }
  });
  if (legacy.externalDatabaseConnectionString !== undefined) {
    await attempt('数据库连接', () =>
      settings.setSecret('database', legacy.externalDatabaseConnectionString as string, { inherited: true }),
    );
  }
  // Missing sections are normal; malformed present sections must remain visible in the report.
  for (const [key, label] of [
    ['ai', '模型配置'],
    ['paths', '数据目录'],
    ['games', '游戏设置'],
  ] as const) {
    if (legacy[key] !== undefined && (!legacy[key] || typeof legacy[key] !== 'object' || Array.isArray(legacy[key]))) {
      report.push({ label, status: 'failed' });
    }
  }
  if (legacy.publish !== undefined && !Array.isArray(legacy.publish))
    report.push({ label: '发布连接设置', status: 'failed' });
  const ai = object(legacy.ai);
  if (ai.apiKey !== undefined)
    await attempt('模型密钥', () => settings.setSecret('ai', ai.apiKey as string, { inherited: true }));
  for (const key of ['baseUrl', 'model']) {
    if (ai[key] !== undefined)
      await attempt(key === 'model' ? '模型名称' : '模型地址', () => settings.update(`ai.${key}`, ai[key]));
  }
  /** Flattens legacy path overrides without turning derived paths into explicit values. */
  async function paths(node: Record<string, unknown>, prefix = '') {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'string') {
        await attempt('数据或图片目录', async () => {
          if (!pathKeys.includes(path)) throw new Error();
          await settings.update(`paths.${path}`, value);
        });
      } else if (value && typeof value === 'object' && !Array.isArray(value)) await paths(object(value), path);
      else report.push({ label: '数据或图片目录', status: 'failed' });
    }
  }
  await paths(object(legacy.paths));
  const games = object(legacy.games);
  for (const [game, raw] of Object.entries(games)) {
    const record = object(raw);
    if (
      !['hearthstone', 'yugioh'].includes(game)
      || !raw
      || typeof raw !== 'object'
      || Array.isArray(raw)
      || (record.image !== undefined && (!record.image || typeof record.image !== 'object' || Array.isArray(record.image)))
    ) {
      report.push({ label: '游戏设置', status: 'failed' });
    }
  }
  for (const game of ['hearthstone', 'yugioh']) {
    const image = object(object(games[game]).image);
    for (const key of ['bucketDir', ...(game === 'hearthstone' ? ['rendererBaseUrl'] : [])]) {
      if (image[key] !== undefined)
        await attempt('游戏图片设置', () => settings.update(`games.${game}.image.${key}`, image[key]));
    }
  }
  const rows: unknown[] = Array.isArray(legacy.publish) ? legacy.publish : [];
  for (const row of rows) {
    const target = object(row);
    await attempt('发布连接设置', async () => {
      const key = typeof target.credentialKey === 'string' ? target.credentialKey : randomUUID();
      const profile = {
        credentialKey: key,
        publishTarget: target.publishTarget,
        environment:   target.environment,
        ...(target.targetFingerprint ? { targetFingerprint: target.targetFingerprint } : {}),
      };
      await settings.update('publish', [...settings.snapshot().config.publish, profile]);
      await attempt('发布连接凭据', async () => {
        const secret = await source.credential(`publish-target:${key}`);
        if (secret === null) return null;
        await settings.setSecret(`publish:${key}`, secret, { inherited: true });
      });
    });
  }
  const oldYugioh = object(games.yugioh).publish;
  const yugioh = object(oldYugioh);
  if (oldYugioh !== undefined && Object.keys(yugioh).length === 0)
    report.push({ label: '游戏王发布设置', status: 'failed' });
  if (Object.keys(yugioh).length) {
    await attempt('游戏王发布设置', async () => {
      const config = settings.snapshot();
      config.config.games.yugioh ??= {};
      config.config.games.yugioh.publish = yugioh as NonNullable<
        NonNullable<typeof config.config.games.yugioh>['publish']
      >;
      await settings.saveJson(JSON.stringify(config.config), config.revision);
    });
    await attempt('游戏王发布凭据', async () => {
      const secret = await source.credential('yugioh-publish-target');
      if (secret === null) return null;
      await settings.setSecret('yugioh-publish', secret, { inherited: true });
    });
  }
  // Archive old login material encrypted; never activate its session or gate local work.
  await attempt('登录会话', async () => {
    const value = await source.session();
    if (value === null) return null;
    const session = object(JSON.parse(value));
    if (typeof session.baseUrl !== 'string' || typeof session.cookieHeader !== 'string') throw new Error();
    await settings.setSecret('legacy-session', JSON.stringify(session));
  });
  await attempt('登录凭据', async () => {
    const login = await source.login();
    if (login === null) return null;
    await settings.setSecret('legacy-login', JSON.stringify(login));
  });
  await settings.finishInheritance(report);
}
