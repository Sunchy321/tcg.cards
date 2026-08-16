# 用户配置系统设计

## 概述

设计一套用户配置功能，支持：

1. **不登录也能使用** — 匿名用户本地存储配置，不依赖远端 API
2. **登录后与远端同步** — 登录后配置在设备间同步，冲突以远端为准

配置范围：固定可配置项（UI 偏好 + 游戏行为偏好），不包含用户生成内容（收藏夹、牌组等）。

## 术语

| 术语 | 含义 |
|------|------|
| `lang` | 界面 UI 语言，跨游戏，存储在 global 配置 |
| `locale` | 游戏数据语言，控制卡图、搜索结果等，按游戏独立 |
| global 配置 | `game_id = 'global'`，存跨游戏配置（lang、gameLocales 等） |
| game 配置 | `game_id = '{game}'`（如 `hearthstone`、`magic`），存游戏级配置 |
| 匿名 UUID | 首次访问生成，存跨域 cookie，关联匿名配置 |

术语详见 `CONTEXT.md` → User Configuration 章节。

## 数据模型

### 远端表

`public.user_configs`：

| 列 | 类型 | 说明 |
|----|------|------|
| `user_id` | VARCHAR | Better Auth 的 user.id |
| `game_id` | VARCHAR | `global`、`hearthstone`、`magic` 等 |
| `config` | JSONB | 整份配置 JSON |
| `updated_at` | TIMESTAMP | 自动更新 |

- 一个用户在一个 game 下只有一行
- JSONB 整读整写，不查询或部分更新内部字段
- 匿名用户不创建行

### 本地存储

| 存储 | Key | 内容 |
|------|-----|------|
| localStorage | `tcg_config` | 当前游戏的配置 JSON（per-origin 隔离） |
| cookie | `tcg_global_config` | global 配置 JSON（跨域共享） |
| cookie | `tcg_anonymous_id` | 匿名 UUID（跨域共享） |

### 配置 Schema

每个 game 和 global 各自独立的 Zod schema，定义类型和默认值：

```ts
// 示例
const GlobalConfigSchema = z.object({
  lang: z.string().default('zh-CN'),
  gameLocales: z.record(z.string()).default({}),
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
});

const HearthstoneConfigSchema = z.object({
  searchLayout: z.enum(['grid', 'list']).default('grid'),
  // ...
});
```

- 新增配置项：改 schema + `.default()`，旧 JSON 自动补默认值（Zod 自动）
- 废弃配置项：`.strip()` 自动丢弃旧字段
- 类型变更：通过 `.pipe()` 或 preprocess transform 处理

## 配置继承链

读取某游戏配置时的优先级（高到低）：

```
游戏配置 > global 配置 > Zod .default()
```

- global 配置为所有游戏提供 fallback 默认值
- 用户访问某游戏时，游戏配置覆盖 global 同名 key
- 未访问过的游戏不创建 `user_configs` 行

## API 设计

端点在 `packages/console-api/src/orpc/user-config.ts`，各站点分别导入挂载：

### `GET /user-config/{game_id}`

- 鉴权：从 session 取 `user_id`，未登录返回 401
- 返回该 game_id 的完整 config JSON
- 不存在时返回 `null`，客户端用 Zod 默认值补全

### `PUT /user-config/{game_id}`

- 鉴权：同 GET
- body：完整 config JSON（整份替换）
- user_id 从 session 取，不接受客户端传参

## 同步规则

### 阶段 1：应用加载（任何时候）

1. 读 localStorage → 获取游戏配置
2. 读 cookie → 获取 global 配置、匿名 UUID
3. Zod parse（补默认值 + 剥废弃字段）→ 得到有效配置
4. 应用到 UI

### 阶段 2：用户登录

1. 登录成功
2. `GET /user-config/{game_id}` → 拿到远端 JSON（B）；本地已有 A
3. 合并：逐 key，B 有值 → 用 B（远端赢），B 无值 → 保留 A
4. 合并结果 C 写入 localStorage
5. `PUT /user-config/{game_id}` body: C → 推回远端（上传 A 独有的 key）
6. 进入"已登录同步"模式

### 阶段 3：登录后配置变更

1. 用户修改 → 本地 JSON 立即更新 → 写入 localStorage → UI 即时反映
2. 防抖（如 1 秒）后 → `PUT /user-config/{game_id}` 推送整份 JSON
3. 推送失败 → 标记"未同步"，下次变更时重试

### 阶段 4：用户退出登录

1. 停止同步标记
2. 保留当前 localStorage 配置
3. 按匿名模式运行（仅本地读写）
4. 再次登录 → 回到阶段 2

### 阶段 5：已登录态页面刷新/重开

1. 读 localStorage（上次合并后的缓存）
2. `GET /user-config/{game_id}` → 拿远端最新
3. 再次合并（同阶段 2 步骤 3）→ 写入 localStorage
4. 保证多设备间同步

### locale 双写机制

游戏配置中的 `locale` 字段变更时，`useUserConfig(gameId)` 自动同步到 global 配置的 `gameLocales.{gameId}`：

```
改 hearthstone locale = 'zhCN'
  → 改本地 hearthstone 配置的 locale
  → 更新 global.gameLocales.hearthstone = 'zhCN'
  → 写 cookie（tcg_global_config）
  → 推送远端 hearthstone 配置
  → 推送远端 global 配置
```

门户站只需读 global 配置 cookie 即可获取各游戏 locale，无需跨域请求。

## 前端接口

### `useUserConfig(gameId: string)`

返回 `{ config, setConfig, isSynced }`。

- 内部封装 localStorage 读写、远端同步、locale 双写
- 用 `useAsyncData` 包裹远端请求，支持 SSR 水合
- `setConfig` 触发本地即时更新 + 防抖远端推送

### `useGlobalConfig()`

返回 `{ config, setConfig }`。

- 内部封装 cookie 读写、远端同步
- 负责 `lang`、`gameLocales` 等跨游戏配置
- SSR 阶段通过 `useAsyncData` 拉远端

## 配置项（初始）

### global

| Key | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `lang` | `string` | `'zh-CN'` | UI 界面语言 |
| `gameLocales` | `Record<string, string>` | `{}` | 各游戏的 locale |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'auto'` | 主题 |

### hearthstone / magic

| Key | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `locale` | `string` | 待定 | 游戏数据语言 |
| `searchLayout` | `'grid' \| 'list'` | `'grid'` | 搜索结果布局 |

## SSR 水合处理

- `useGlobalConfig()` / `useUserConfig()` 内部使用 `useAsyncData`
- SSR 阶段直接拉远端配置，数据随 HTML payload 下发
- 客户端水合时使用同一份数据，无 hydration mismatch
- 远端请求 < 100ms，对 SSR 性能影响可忽略

## 前端界面

### 设置页布局

沿用现有的 2-column 布局（Desktop：220px sidebar + content，Mobile：stacked）。三个 tab 不变：

| Tab | 功能 | 登录前 | 登录后新增 |
|-----|------|--------|------------|
| General | global 配置（`lang`、`theme`） | 可操作（本地生效） | 同步状态 |
| Account | 显示名、密码 | 未登录遮罩（已有） | — |
| Game | 游戏配置（`locale`、`searchLayout`） | 可操作（本地生效） | 同步状态 |

### 同步状态指示

在每个 SettingsCard 的 header 右侧展示同步状态：

| 状态 | 图标 | 颜色 |
|------|------|------|
| 已同步 | `lucide:check` | gray |
| 同步中 | `lucide:loader`（旋转） | blue |
| 有未同步变更 | `lucide:cloud-off` | amber |
| 同步失败 | `lucide:alert-circle` | red |

未登录时不显示状态。

### 继承控制按钮

game 级配置项如果 global 中有同名 fallback 字段，提供两个操作：

**"设为默认"按钮：**
- 将当前 game 配置的值写入 global 配置
- 放在配置控件旁，如 `searchLayout` 的 Grid/List 切换右侧
- `game.value === global.value` 时自动 disabled
- 点后立即生效，无确认弹窗

**"重置为默认"按钮：**
- 清除 game 级覆盖，恢复跟随 global
- `game 中没有显式设置该 key`（即当前值来自继承）时自动 disabled

这两个按钮属于同一组语义相反的继承控制操作。

### 配置项控件

| 配置项 | 控件 | 位置 | 按钮 |
|--------|------|------|------|
| `lang` | USelect | General tab | — |
| `theme` | 三段切换（Light / Dark / Auto） | General tab | — |
| `locale` | USelect | Game tab | —（不可继承） |
| `searchLayout` | 两段切换（Grid / List） | Game tab | "设为默认" + "重置为默认" |

### 门户站设置页

`site-main` 新建 `/settings` 页，只包含 General tab（global 配置中的 `lang` 和 `theme`）。不展示各游戏配置。
