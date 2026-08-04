# 公告页右侧图片来源区分（预览 / 实际存储） 设计

## 背景

公告页右侧展示的卡图通过 `CardImage :src="previewSrc(...)"` 传入一个 base64 data URL。这张图可能来自三个来源：

- **预览**（点"预览"按钮）：`previewItem` 调渲染器临时渲染，不写存储
- **写入存储后回读**（点"写入存储"按钮）：`renderItems` 渲染并写 bucket，再按 `renderHash` 读回
- **加载已有图**（打开公告时）：`getItemImages` 从 bucket 读已存在图

前端无法区分当前显示的图是"预览"（临时、刷新即失）还是"实际存储"（持久化），也无法拿到实际路径。这会导致：编辑者不知道看到的图会不会持久存在、和站点上最终展示的图是否一致。

设计目标：明确区分预览图与实际存储图，并在 UI 上呈现来源；对存储图提供实际路径。

## 现状

### 数据流

`SidePreview { side, lang, hash, category, template, base64, mimeType }` 存在前端内存 `itemPreviews`（以条目 `_key` 为 key）。

三个写入点的差异：

| 来源 | RPC | `hash` | `category`/`template` | 持久化 |
|---|---|---|---|---|
| 预览 | `previewItem` | `''` | `''` | 否 |
| 写入后回读 | `renderItems` + `previewImage` | `renderHash`（非空） | 有 | 是 |
| 加载已有 | `getItemImages` | `''` | 有 | 是 |

`previewSrc` 只按 `(itemKey, side, lang)` 取一条 `SidePreview` 拼成 data URL。`CardImage` 收到非空 `src` 就直接用它（`CardImage.vue` 第 59-61 行），不走 `renderHash → buildCardImageUrl` 的实际路径逻辑。

### 问题

- `hash:''` 既可能是"预览"也可能是"加载的已有图"，无显式来源标记
- `getItemImages` 响应**不含 `renderHash`**（内部用它定位 bucket 文件，但未返回给前端），所以"已有图"无法计算实际路径

## 方案

### 1. 数据模型：`SidePreview` 增加 `source`

```ts
source: 'preview' | 'storage'
```

- `handlePreviewItem`（`previewItem`）→ `source: 'preview'`
- `applyRenderResults`（`renderItems` 回读）→ `source: 'storage'`
- `loadExistingImages`（`getItemImages`）→ `source: 'storage'`

显式字段，不依赖 `hash`/`category` 空值约定，语义清晰。

### 2. UI 呈现：仅预览显示符号

- `source: 'preview'` → 图片上显示一个小符号（如预览图标），提示"这是临时预览"
- `source: 'storage'` → 不显示任何符号（已存是默认/正常状态）
- 无图（占位图）不显示符号
- 预览 → 写入存储后，`mergePreviews` 按 `(side, lang)` 覆盖同 key 条目，条目变为 `source: 'storage'`，符号随之消失

### 3. 实际路径（增强项）

- 存储图且已知 `renderHash` 时，用 `buildCardImageUrl(assetBaseUrl, renderHash, variant, premium, category)` 得到真实 URL
- 现状只有"写入后回读"路径有 `renderHash`；"已有图"（`getItemImages`）没有
- 若要"已有图"也能拿到实际路径，需给 `getItemImages` 响应补 `renderHash` 字段

## 改动点

- 前端 `apps/app-console-desktop/src/utils/announcement-preview.ts`：`SidePreview` 加 `source` 字段
- 前端 `announcement/index.vue`：三个写入点标记 `source`；右侧图片区加来源角标
- 可选后端 `render.ts`：`getItemImages` 响应补 `renderHash`

## 已定决策

1. 来源区分：显式 `source` 字段
2. UI：不显示图片角标，改为给图片下方的 `prev`/`curr` 标签着色——`preview` 用 amber + 中等字重，`storage` 保持灰色
3. "实际路径"展示/复制：不做（砍掉），`getItemImages` 不改

## 实现记录

- `SidePreview` 增加 `source: 'preview' | 'storage'`
- 三个写入点标记来源：`previewItem` → `preview`；`renderItems` 回读 / `getItemImages` → `storage`
- 新增 `previewSourceOf(itemKey, side)` helper
- 模板：图片下方 `prev`/`curr` 标签按来源着色（`preview` → `text-amber-600 font-medium`，`storage` → `text-slate-500`）
- `announcement-preview.test.ts` 的 fixture 补 `source` 字段
