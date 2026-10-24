import { findNodeAtLocation, parseTree } from 'jsonc-parser';
import { z } from 'zod';

export const pathGroups = {
  magic: {
    label: '万智牌',
    data: {
      scryfall: 'Scryfall',
      mtgch: 'MTGCH',
      mtgjson: 'MTGJSON',
      gatherer: 'Gatherer',
      mtga: 'MTGA',
      'mtg-vectors': '卡牌矢量图',
      'magic-comp-rules-zh-cn': '中文完整规则'
    },
    image: {
      card: '卡牌图片',
      rule: '规则图片',
      set: '系列图片'
    },
  },
  hearthstone: { label: '炉石传说', data: { hsdata: '炉石数据仓库' }, image: { card: '卡牌图片' } },
} as const;

export const pathKeys = ['data', 'asset', ...Object.entries(pathGroups).flatMap(([game, group]) =>
  (['data', 'image'] as const).flatMap(kind => [`${game}.${kind}`, ...Object.keys(group[kind]).map(leaf => `${game}.${kind}.${leaf}`)]))];

/** Non-empty macOS absolute directory path, without requiring it to exist yet. */
const directory = z.string().trim().min(1).refine(value => value.startsWith('/') && !value.includes('\0'), '请输入完整目录路径');
/** HTTP service address that never embeds credentials. */
const httpUrl = z.url({ protocol: /^https?$/ }).refine(value => {
  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}, '服务地址不能包含密码或查询参数');
/** Ordinary publication metadata; the connection string lives in encrypted storage. */
export const publishTarget = z.strictObject({
  credentialKey: z.uuid(),
  publishTarget: z.enum(['magic', 'hearthstone', 'yugioh']),
  environment: z.string().trim().min(1),
  targetFingerprint: z.string().optional(),
});
/** Public configuration accepted identically by forms, JSON and the main process. */
export const configuration = z.strictObject({
  version: z.literal(1),
  paths: z.partialRecord(z.enum(pathKeys), directory).default({}),
  ai: z.strictObject({ baseUrl: httpUrl.optional(), model: z.string().trim().min(1).optional() }).default({}),
  publish: z.array(publishTarget).refine(rows => new Set(rows.map(row => row.credentialKey)).size === rows.length, '发布连接重复').default([]),
  games: z.strictObject({
    hearthstone: z.strictObject({ image: z.strictObject({ rendererBaseUrl: httpUrl.optional(), bucketDir: directory.optional() }).optional() }).optional(),
    yugioh: z.strictObject({
      image: z.strictObject({ bucketDir: directory.optional() }).optional(),
      publish: z.strictObject({ publishTargetId: z.string().min(1), environment: z.string().min(1), targetFingerprint: z.string() }).optional(),
    }).optional(),
  }).default({}),
});

/** Validated ordinary settings, safe for the advanced editor. */
export type Configuration = z.infer<typeof configuration>;
/** User-visible outcome of inheriting one category of legacy settings. */
export interface MigrationItem { label: string; status: 'imported' | 'missing' | 'failed'; }
/** Read-only public snapshot; encrypted values and secrets never enter this payload. */
export interface SettingsSnapshot {
  config: Configuration;
  revision: number;
  credentials: Record<string, boolean>;
  migration: MigrationItem[];
}
/** Converts validation failures to product language without echoing input values. */
export function validationMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  const path = issue?.path.map(String) ?? [];
  const category = path[0] === 'paths' ? '目录设置'
    : path[0] === 'ai' ? (path[1] === 'baseUrl' ? '模型服务地址' : path[1] === 'model' ? '模型名称' : '模型配置')
    : path[0] === 'publish' ? `第 ${Number(path[1] ?? 0) + 1} 个发布连接`
    : path[0] === 'games' ? '游戏图片或发布设置' : '配置';
  if (issue?.code === 'unrecognized_keys') return `${category}包含不支持的项目，请检查后重试。`;
  return `${category}内容不正确，请检查必填项、类型和格式。`;
}
/** Adds a numeric location without echoing field names, values or parser snippets. */
function position(text: string, offset: number) {
  const prefix = text.slice(0, offset).split('\n');
  return `（第 ${prefix.length} 行，第 ${(prefix.at(-1)?.length ?? 0) + 1} 列）`;
}
/** Parses strict JSON and reports a safe category and source location. */
export function parseConfiguration(text: string): Configuration {
  let input: unknown;
  try { input = JSON.parse(text); } catch (error) {
    const offset = error instanceof Error ? /position (\d+)/.exec(error.message)?.[1] : undefined;
    throw new Error(`配置不是有效的 JSON，请检查标点和引号。${position(text, offset === undefined ? text.length : Number(offset))}`);
  }
  const result = configuration.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.filter((key): key is string | number => typeof key === 'string' || typeof key === 'number') ?? [];
    if (issue?.code === 'unrecognized_keys') path.push(issue.keys[0]!);
    const tree = parseTree(text);
    const offset = tree ? findNodeAtLocation(tree, path)?.offset ?? 0 : 0;
    throw new Error(`${validationMessage(result.error)}${position(text, offset)}`);
  }
  return result.data;
}
