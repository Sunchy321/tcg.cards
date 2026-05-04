# console-api 静态分级路由设计

## 背景

当前 `packages/console-api` 的 oRPC 路由通过工厂函数（`createRuleTrpc`、`createImageTrpc`、`createHsdataTrpc`）将宿主特定实现注入 procedure。这种方式有以下问题：

1. 工厂函数增加组装复杂度，site-console 仍需关心注入细节
2. 具体实现（`site-console/server/lib/*`）散落在应用层，无法被其他终端（desktop、mobile）直接复用
3. 没有机制声明哪些端点属于哪个终端，各终端只能全量使用同一个 router
4. service-internal 只委托到 console-api，但 console-api 当前没有为 app 终端提供适合的 router 子集

## 目标

1. 去掉所有工厂函数，procedure 通过 oRPC context 直接访问 env binding
2. 将 site-console/server/lib 里的实现代码迁移到 console-api 内部模块
3. 为所有 procedure 标注分级（light / medium / heavy）
4. 在 console-api 里静态组装三个终端 router，供各终端直接导出使用

## 分级定义

| 级别 | 含义 | 对应终端 |
|------|------|----------|
| light | 简单 CRUD，无重型 I/O，适合所有终端 | web / mobile / desktop |
| medium | 中等复杂度，可能涉及 R2 读取或跨表聚合 | mobile / desktop |
| heavy | 重型操作（大文件导入、图片处理、长任务） | desktop |

## 现有端点分级清单

| 端点路径 | 级别 | 理由 |
|----------|------|------|
| `magic.announcement.*` | light | 简单公告 CRUD |
| `magic.dataSource.*` | light | 静态数据源查询 |
| `magic.rule.list` | light | 规则版本列表 |
| `magic.rule.get` | light | 规则版本详情 |
| `magic.rule.getNodes` | light | 规则节点列表 |
| `magic.rule.nodeHistory` | medium | 历史节点查询，可能跨多版本 |
| `magic.rule.changes` / `change` | medium | 变更记录查询 |
| `magic.rule.review` / `reviewBatch` | medium | 审查操作，写入 DB |
| `magic.rule.compareVersions` | medium | 版本比对聚合 |
| `magic.rule.nodeContent` | medium | 节点内容读取（含解压） |
| `magic.rule.deleteVersion` | heavy | 删除版本，级联清理 |
| `magic.rule.syncLatest` | heavy | 同步最新数据，触发任务 |
| `magic.rule.loadFromData` | heavy | 从 R2 加载并导入 |
| `magic.rule.uploadToR2` | heavy | 上传规则数据到 R2 |
| `magic.rule.uploadArchive` | heavy | 上传完整存档到 R2 |
| `magic.rule.rematch` | heavy | 重新匹配实体，长任务 |
| `hearthstone.announcement.*` | light | 简单公告 CRUD |
| `hearthstone.set.*` | light | 卡包 CRUD |
| `hearthstone.tag.*` | light | Tag CRUD |
| `hearthstone.image.exportRequirements` | medium | 查询图片需求并导出 JSON |
| `hearthstone.dataSource.hsdata.*` | heavy | 大型 XML 导入、投影 |
| `hearthstone.image.importArchive` | heavy | 从浏览器导入图片压缩包 |

> 注：上表为初始提案，可在 review 阶段调整各端点的分级。

## 架构方案

### Tree-shaking 支持

Tree-shaking 的核心原则：**各终端 router 文件只 import 自己所需 tier 的模块，bundler 就能在打包时自动裁剪未引用的 procedure 及其依赖（DB schema、lib 实现等）**。

实现方式：**按 tier 拆分文件**，让 import 关系体现 tier 边界。

对于 `rule` 这类跨 tier 的端点命名空间，拆分为三个文件：

```
magic/rule-light.ts   → list, get, getNodes
magic/rule-medium.ts  → nodeHistory, changes, change, review, reviewBatch, compareVersions, nodeContent
magic/rule-heavy.ts   → deleteVersion, syncLatest, loadFromData, uploadToR2, uploadArchive, rematch
```

各终端 router 文件按需 import：

```ts
// web-router.ts — 只 import light
import { ruleLight } from './magic/rule-light';
// 不 import rule-medium.ts / rule-heavy.ts
// → rule-medium.ts 和 rule-heavy.ts 及其依赖（importer、reviewer 等）不进 web bundle

// mobile-router.ts — import light + medium
import { ruleLight }  from './magic/rule-light';
import { ruleMedium } from './magic/rule-medium';

// desktop-router.ts — import 全部
import { ruleLight }  from './magic/rule-light';
import { ruleMedium } from './magic/rule-medium';
import { ruleHeavy }  from './magic/rule-heavy';
```

### 目录结构变化

```
packages/console-api/src/
  lib/                          ← 新增：从 site-console/server/lib 迁移的实现
    hearthstone/
      card-image.ts
      hsdata-import.ts
      hsdata-project.ts
    magic/
      document/
        config.ts
        content.ts
        history.ts
        importer.ts
        matcher.ts
        parser.ts
        reviewer.ts
  orpc/
    hearthstone/
      announcement.ts           ← 无变化（light）
      set.ts                    ← 无变化（light）
      tag.ts                    ← 无变化（light）
      image-medium.ts           ← exportRequirements（medium）
      image-heavy.ts            ← importArchive（heavy）
      data-source/
        hsdata-heavy.ts         ← 全部 hsdata 端点（heavy）
    magic/
      announcement.ts           ← 无变化（light）
      data-source.ts            ← 无变化（light）
      rule-light.ts             ← list, get, getNodes
      rule-medium.ts            ← nodeHistory, changes, change, review, reviewBatch, compareVersions, nodeContent
      rule-heavy.ts             ← deleteVersion, syncLatest, loadFromData, uploadToR2, uploadArchive, rematch
    web-router.ts               ← 只 import light tier
    mobile-router.ts            ← import light + medium tier
    desktop-router.ts           ← import light + medium + heavy tier
```

### 终端 Router 组装

```ts
// web-router.ts
import { announcementTrpc as magicAnn } from './magic/announcement';
import { dataSourceTrpc as magicDs }    from './magic/data-source';
import { ruleLight }                    from './magic/rule-light';
import { announcementTrpc as hsAnn }    from './hearthstone/announcement';
import { setTrpc }                      from './hearthstone/set';
import { tagTrpc }                      from './hearthstone/tag';

export const webRouter = {
  magic:       { announcement: magicAnn, dataSource: magicDs, rule: ruleLight },
  hearthstone: { announcement: hsAnn, set: setTrpc, tag: tagTrpc },
};
export type WebRouter = typeof webRouter;
```

```ts
// mobile-router.ts
// ... 同 web，额外加入 medium tier
import { ruleMedium }     from './magic/rule-medium';
import { imageExport }    from './hearthstone/image-medium';

export const mobileRouter = {
  magic:       { ..., rule: { ...ruleLight, ...ruleMedium } },
  hearthstone: { ..., image: { exportRequirements: imageExport } },
};
export type MobileRouter = typeof mobileRouter;
```

```ts
// desktop-router.ts
// ... 同 mobile，额外加入 heavy tier
import { ruleHeavy }    from './magic/rule-heavy';
import { imageImport }  from './hearthstone/image-heavy';
import { hsdataHeavy }  from './hearthstone/data-source/hsdata-heavy';

export const desktopRouter = {
  magic:       { ..., rule: { ...ruleLight, ...ruleMedium, ...ruleHeavy } },
  hearthstone: { ..., image: { exportRequirements: imageExport, importArchive: imageImport }, dataSource: { hsdata: hsdataHeavy } },
};
export type DesktopRouter = typeof desktopRouter;
```

各终端直接从 console-api 导入对应 router：

```ts
// site-console/server/orpc/service.ts
export { webRouter as router } from '@tcg-cards/console-api';
export type { WebRouter as Router } from '@tcg-cards/console-api';

// service-internal/src/orpc/service.ts
export { desktopRouter as router } from '@tcg-cards/console-api';
export type { DesktopRouter as Router } from '@tcg-cards/console-api';
```

### 实现迁移策略

`site-console/server/lib` 里的实现使用以下 alias：

| site-console alias | console-api 对应 |
|--------------------|-----------------|
| `#db/db` | `@tcg-cards/db/db` |
| `#schema/hearthstone` | `@tcg-cards/db/schema/hearthstone` |
| `#schema/magic` / `#schema/magic/document` | `@tcg-cards/db/schema/magic` |
| `#model/...` | `@tcg-cards/model/src/...` |

Node.js 内置模块兼容性：

- `node:crypto`：`createHash` 已在 console-api 中使用；`randomUUID` 可改为 `crypto.randomUUID()`（Workers 全局）
- `node:zlib`：`gzipSync` / `gunzipSync` ——`site-console` 和 `service-internal` 的 wrangler.toml 均已开启 `nodejs_compat`，迁移后可直接使用

## 非目标

- 本次不改动数据库 schema
- 本次不改动认证机制
- 本次不新增任何端点
- 本次不处理 app-console-desktop 或 app-console-mobile 的实际接入
- 本次不修改 lib 实现的业务逻辑


