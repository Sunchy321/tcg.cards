# 实现计划：console-api 静态分级路由

## Todo 列表

- [ ] 步骤 1：迁移 magic lib 实现到 console-api
- [ ] 步骤 2：迁移 hearthstone lib 实现到 console-api
- [ ] 步骤 3：拆分 magic/rule.ts 为 rule-light / rule-medium / rule-heavy
- [ ] 步骤 4：拆分 hearthstone/image.ts 为 image-medium / image-heavy
- [ ] 步骤 5：将 hearthstone/data-source/hsdata.ts 改为静态（heavy）
- [ ] 步骤 6：组装三个终端 router 文件（web / mobile / desktop）
- [ ] 步骤 7：更新 console-api 导出（index.ts / orpc/index.ts）
- [ ] 步骤 8：更新 site-console service.ts 使用 webRouter
- [ ] 步骤 9：更新 service-internal service.ts 使用 desktopRouter
- [ ] 步骤 10：删除旧工厂函数和 site-console/server/lib 中已迁移的文件

---

## 详细步骤

### 步骤 1：迁移 magic lib 实现到 console-api

将以下文件从 `apps/site-console/server/lib/magic/document/` 复制到 `packages/console-api/src/lib/magic/document/`，并替换 alias：

| 文件 | alias 替换 |
|------|-----------|
| `config.ts` | 无 alias，直接复制 |
| `parser.ts` | 无 alias，直接复制 |
| `matcher.ts` | `#db/db` → `@tcg-cards/db/db`，`#schema/magic/document` → `@tcg-cards/db/schema/magic` |
| `content.ts` | 同上，`#model/magic/schema/basic` → `@tcg-cards/model/src/magic/schema/basic` |
| `history.ts` | 同上 |
| `reviewer.ts` | 同上 |
| `importer.ts` | 同上，`node:crypto` 中 `randomUUID` 保留（Workers 支持），`gzipSync` 保留 |

### 步骤 2：迁移 hearthstone lib 实现到 console-api

将以下文件从 `apps/site-console/server/lib/hearthstone/` 复制到 `packages/console-api/src/lib/hearthstone/`，并替换 alias：

| 文件 | alias 替换 |
|------|-----------|
| `hsdata-import.ts` | `#db/db` → `@tcg-cards/db/db`，`#schema/hearthstone` → `@tcg-cards/db/schema/hearthstone` |
| `hsdata-project.ts` | 同上，`#model/hearthstone/schema/entity` 等 → `@tcg-cards/model/src/...` |
| `card-image.ts` | 同上，`#model/hearthstone/schema/data/image` 等 → `@tcg-cards/model/src/...`；`node:crypto` 保留 |

### 步骤 3：拆分 magic/rule.ts 为三个文件

当前 `packages/console-api/src/orpc/magic/rule.ts` 是工厂函数，改为：

- `rule-light.ts`：`list`、`get`、`getNodes`，直接从 lib/magic/document/importer 调用 `listDocumentVersions`；DB 查询简单
- `rule-medium.ts`：`nodeHistory`、`changes`、`change`、`review`、`reviewBatch`、`compareVersions`、`nodeContent`，调用 lib/magic/document/{history,reviewer,content}
- `rule-heavy.ts`：`deleteVersion`、`syncLatest`、`loadFromData`、`uploadToR2`、`uploadArchive`、`rematch`，调用 lib/magic/document/importer

每个文件导出一个普通对象（不是函数），通过 context 访问 env binding。

### 步骤 4：拆分 hearthstone/image.ts 为两个文件

- `image-medium.ts`：`exportRequirements` 端点，调用 `lib/hearthstone/card-image.ts` 的 `exportCardImageRequirements`
- `image-heavy.ts`：`importArchive` 端点，调用 `lib/hearthstone/card-image.ts` 的 `importCardImageArchiveFromBrowser`

### 步骤 5：将 hearthstone/data-source/hsdata.ts 改为静态（heavy）

去掉工厂函数包装，直接导出静态对象，procedure 内部调用 `lib/hearthstone/hsdata-import` 和 `lib/hearthstone/hsdata-project`。

### 步骤 6：组装三个终端 router 文件

在 `packages/console-api/src/orpc/` 新建：

**web-router.ts**（light only）：
```ts
export const webRouter = {
  magic:       { announcement, dataSource, rule: ruleLight },
  hearthstone: { announcement, set, tag },
};
export type WebRouter = typeof webRouter;
```

**mobile-router.ts**（light + medium）：
```ts
export const mobileRouter = {
  magic:       { announcement, dataSource, rule: { ...ruleLight, ...ruleMedium } },
  hearthstone: { announcement, set, tag, image: { exportRequirements } },
};
export type MobileRouter = typeof mobileRouter;
```

**desktop-router.ts**（light + medium + heavy）：
```ts
export const desktopRouter = {
  magic:       { announcement, dataSource, rule: { ...ruleLight, ...ruleMedium, ...ruleHeavy } },
  hearthstone: { announcement, set, tag, image: { exportRequirements, importArchive }, dataSource: { hsdata } },
};
export type DesktopRouter = typeof desktopRouter;
```

### 步骤 7：更新 console-api 导出

- `packages/console-api/src/orpc/index.ts`：导出三个 router 和类型
- `packages/console-api/src/index.ts`：透传（已有 `export * from './orpc'`）
- 删除旧的 `createRouter`、`createRuleTrpc`、`createImageTrpc`、`createHsdataTrpc` 等工厂导出
- 删除旧的 `service.ts`（替换为三个终端 router 文件）

### 步骤 8：更新 site-console service.ts

```ts
// apps/site-console/server/orpc/service.ts
export { webRouter as router } from '@tcg-cards/console-api';
export type { WebRouter as Router } from '@tcg-cards/console-api';
```

### 步骤 9：更新 service-internal service.ts

```ts
// apps/service-internal/src/orpc/service.ts
export { desktopRouter as router } from '@tcg-cards/console-api';
export type { DesktopRouter as Router } from '@tcg-cards/console-api';
```

### 步骤 10：删除旧文件

- `packages/console-api/src/orpc/magic/rule.ts`（已拆分）
- `packages/console-api/src/orpc/hearthstone/image.ts`（已拆分）
- `packages/console-api/src/orpc/service.ts`（已替换）
- `packages/console-api/src/orpc/magic/index.ts`（已替换）
- `packages/console-api/src/orpc/hearthstone/index.ts`（已替换）
- `apps/site-console/server/lib/magic/document/`（已迁移到 console-api/src/lib）
- `apps/site-console/server/lib/hearthstone/card-image.ts`（已迁移）
- `apps/site-console/server/lib/hearthstone/hsdata-import.ts`（已迁移）
- `apps/site-console/server/lib/hearthstone/hsdata-project.ts`（已迁移）
