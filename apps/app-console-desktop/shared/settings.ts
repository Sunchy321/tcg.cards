import { findNodeAtLocation, parseTree } from 'jsonc-parser';
import { z } from 'zod';

export const pathGroups = {
  magic: {
    label: '万智牌',
    data:  {
      'scryfall':               'Scryfall',
      'mtgch':                  'MTGCH',
      'mtgjson':                'MTGJSON',
      'gatherer':               'Gatherer',
      'mtga':                   'MTGA',
      'mtg-vectors':            '卡牌矢量图',
      'magic-comp-rules-zh-cn': '中文完整规则',
    },
    image: {
      card: '卡牌图片',
      rule: '规则图片',
      set:  '系列图片',
    },
  },
  hearthstone: { label: '炉石传说', data: { hsdata: '炉石数据仓库' }, image: { card: '卡牌图片' } },
} as const;

export const pathKeys = [
  'data',
  'asset',
  ...Object.entries(pathGroups).flatMap(([game, group]) =>
    (['data', 'image'] as const).flatMap(kind => [
      `${game}.${kind}`,
      ...Object.keys(group[kind]).map(leaf => `${game}.${kind}.${leaf}`),
    ]),
  ),
];

/** Non-empty macOS absolute directory path, without requiring it to exist yet. */
const directory = z
  .string()
  .trim()
  .min(1)
  .refine(value => value.startsWith('/') && !value.includes('\0'), '请输入完整目录路径');
/** PostgreSQL connection string kept as ordinary configuration, never as a credential. */
const postgresUrl = z.string().trim().min(1).refine(value => {
  try {
    const url = new URL(value);
    return ['postgres:', 'postgresql:'].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}, '请输入有效的 PostgreSQL 连接字符串');
/** HTTP service address that never embeds credentials. */
const httpUrl = z.url({ protocol: /^https?$/ }).refine(value => {
  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}, '服务地址不能包含密码或查询参数');
/** One publish destination the user names; a direct target carries its database connection. */
export const publishTargetConfig = z.strictObject({
  id:                z.uuid(),
  name:              z.string().trim().min(1),
  kind:              z.enum(['direct', 'account']),
  connectionString:  postgresUrl.optional(),
  targetFingerprint: z.string().optional(),
});
/** Games whose publish target selection is remembered between publishes. */
export const publishGames = z.enum(['magic', 'hearthstone', 'yugioh']);
/** Public configuration accepted identically by forms, JSON and the main process. */
export const configuration = z.strictObject({
  version:  z.literal(1),
  database: postgresUrl.optional(),
  paths:    z.partialRecord(z.enum(pathKeys), directory).default({}),
  ai:       z.strictObject({ baseUrl: httpUrl.optional(), model: z.string().trim().min(1).optional() }).default({}),
  targets:  z
    .array(publishTargetConfig)
    .refine(rows => new Set(rows.map(row => row.id)).size === rows.length, '发布目标重复')
    .refine(rows => new Set(rows.map(row => row.name)).size === rows.length, '发布目标名称重复')
    .default([]),
  targetSelection: z.partialRecord(publishGames, z.uuid()).default({}),
  searchStorage:   z.strictObject({
    accountId:       z.string().trim().regex(/^[a-f0-9]{32}$/i).optional(),
    // Directory holding the exported local search packages that publication consumes.
    exportDirectory: z.string().trim().min(1).optional(),
  }).default({}),
  games: z
    .strictObject({
      hearthstone: z
        .strictObject({
          image: z.strictObject({ rendererBaseUrl: httpUrl.optional(), bucketDir: directory.optional() }).optional(),
        })
        .optional(),
      yugioh: z
        .strictObject({
          image: z.strictObject({ bucketDir: directory.optional() }).optional(),
        })
        .optional(),
    })
    .default({}),
});

/** Validated ordinary settings, safe for the advanced editor. */
export type Configuration = z.infer<typeof configuration>;
/** User-visible outcome of inheriting one category of legacy settings. */
export interface MigrationItem {
  label:  string;
  status: 'imported' | 'missing' | 'failed';
}
/** Read-only public snapshot; encrypted values and secrets never enter this payload. */
export interface SettingsSnapshot {
  config:      Configuration;
  revision:    number;
  credentials: Record<string, boolean>;
  migration:   MigrationItem[];
}
/** Converts validation failures to product language without echoing input values. */
export function validationMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  const path = issue?.path.map(String) ?? [];
  const category
    = path[0] === 'database'
      ? '数据库连接'
      : path[0] === 'paths'
        ? '目录设置'
        : path[0] === 'ai'
          ? path[1] === 'baseUrl'
            ? '模型服务地址'
            : path[1] === 'model'
              ? '模型名称'
              : '模型配置'
          : path[0] === 'targets'
            ? `第 ${Number(path[1] ?? 0) + 1} 个发布目标`
            : path[0] === 'targetSelection'
              ? '发布目标选择'
              : path[0] === 'searchStorage'
                ? '搜索数据存储'
                : path[0] === 'games'
                  ? '游戏图片设置'
                  : '配置';
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
  try {
    input = JSON.parse(text);
  } catch (error) {
    const offset = error instanceof Error ? /position (\d+)/.exec(error.message)?.[1] : undefined;
    // The parser error can include snippets from private configuration input.
    // eslint-disable-next-line preserve-caught-error
    throw new Error(
      `配置不是有效的 JSON，请检查标点和引号。${position(text, offset === undefined ? text.length : Number(offset))}`,
    );
  }
  const result = configuration.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path
      = issue?.path.filter((key): key is string | number => typeof key === 'string' || typeof key === 'number') ?? [];
    if (issue?.code === 'unrecognized_keys') path.push(issue.keys[0]!);
    const tree = parseTree(text);
    const offset = tree ? (findNodeAtLocation(tree, path)?.offset ?? 0) : 0;
    throw new Error(`${validationMessage(result.error)}${position(text, offset)}`);
  }
  return result.data;
}
