# 公告条目卡图渲染 设计

## 背景

公告条目（`announcement_items`）已有 `delta` / `glow` / `version` / `lastVersion` 列，但缺少渲染基础设施——编辑器里无法看到卡图效果，站点只能纯文本展示。

设计目标：编辑器触发渲染 → 产物入库，站点只消费已生成的图（与现有卡图管线同构）。

## 1. 渲染规则

### 1.1 条目类型 → 产物

| 条目类型 | 产物 | glow |
|---|---|---|
| `card_change` | base 图 ×1 | 无 |
| `card_update` | prev 图 + curr 图 ×2 | 仅 curr |
| `set_change` / `rule_change` / `format_*` | 不渲染 | — |

- **base 图**：该卡在 `version` 的卡面，无 glow。`card_change` 只有这一张
- **prev 图**（前图）：该卡在 `lastVersion` 的卡面，无 glow
- **curr 图**（后图）：该卡在 `version` 的卡面，带 glow 高亮

### 1.2 delta

delta 标注的是**显示修正**，不是数据补丁：`{ prev?: Partial<RenderModel>, curr?: Partial<RenderModel> }`。

两侧对称工作：渲染某一侧时，从该侧版本的 entity revision 解析出 renderModel，再合并对应侧的 delta。典型场景是热修连续的中间状态未入库——prev 和 curr 两侧都可能依赖 delta 修正。

delta 合并为**客户端行为**：渲染前将 delta 展开到 renderModel 上，以 `renderMode: "full-set"` 发送完整模型给渲染器。不用 `partial-update`。

### 1.3 glow

glow 是 `renderModel` 的一个可选字段：`{ part, type: 'buff' | 'nerf' }[]`。

- curr 图：renderModel 携带 glow
- prev / base 图：renderModel 不含 glow

## 2. renderHash

### 2.1 公式

一条公式覆盖所有侧：`SHA256(canonicalize(renderModel))`。

- prev / base（无 glow）→ renderModel 等同于 entity 存储的 renderModel → hash 等于 `entity_localizations.renderHash` → **与已有卡图天然去重**
- curr（有 glow）→ renderModel 包含 glow → hash 不同 → 同一张卡不同条目不会撞键

### 2.2 位置

hash **不预存**。编辑器和站点各自派生：从 entity revision 取 renderModel → 合并 delta → 挂 glow（若有）→ canonicalize → SHA256 → 拼 URL。

### 2.3 公共工具

hash 算法（`canonicalize` + `Bun.SHA256`）当前在 `hsdata-project.ts` 导入管线里。需抽到共享层（`packages/model` 或 `packages/shared`），编辑器和站点各自引用。

## 3. 渲染参数

| 参数 | 值 |
|---|---|
| zone | `play`（固定） |
| premium | `normal`（固定） |
| template | 条目的 format 是 `battlegrounds` → `battlegrounds`，否则 `normal` |
| category | renderModel 含 glow（curr）→ `glow`，否则（prev / base）→ `base` |
| output | 512 × 768（与现有卡图一致） |

## 4. 数据解析

渲染某一侧时：

1. 取该侧的 buildNumber（`version` 或 `lastVersion`；条目级优先于公告级，lastVersion 空时取 version）
2. 在本地 `entity_localizations` 表中查找 `cardId + buildNumber ∈ version + lang` 的行
3. **不存在 → 渲染报错**（明确信息："版本 {buildNumber} 的卡牌 {cardId} 数据未导入"）
4. 取该行的 `renderModel`，合并该侧 delta
5. 若是 curr 侧，将 `announcement_item.glow` 挂到 renderModel 上
6. 计算 hash、组装渲染请求

## 5. 渲染流程

### 5.1 触发方式

- **逐条目渲染按钮**：每个 `card_change` / `card_update` 条目的卡片下方有"渲染"按钮
- **全公告渲染按钮**：编辑面板顶部"全部渲染"
- 渲染状态四态：等待渲染 / 渲染中（with spinner）/ 已完成 / 需要重渲（delta 或 glow 改动后）

### 5.2 入口

不走 task 系统。在 `apps/service-desktop-runtime/src/orpc/hearthstone/announcement/` 下新增 ORPC 方法（如 `renderItems`），直接调用渲染器。

内部复用现有 image-render 模块的 `POST /render` → PNG → 转 WebP → 写入 `bucketDir` → upsert `card_image_assets` 的管道。

### 5.3 语言选择器

编辑器提供语言选择器（下拉），选项包括"全部语言"和各语言单项。选择特定语言 → 只渲染该语言；选择"全部" → 遍历渲染所有语言。选择器值存 localStorage，跨页面保持。

## 6. 错误处理

- 版本数据未导入 → 指定语言 + buildNumber + cardId 的明确错误
- 渲染器不可达 → 连接错误，与现有 image-render 一致
- 单卡渲染失败 → 记录失败原因，不中断其他条目的渲染

## 7. 前端改动概要

### 编辑器（app-console-desktop）

- 公告编辑页条目卡片增加"渲染"按钮 + 渲染状态指示
- 编辑面板顶部增加"全部渲染"按钮 + 语言选择器
- 渲染完成后显示卡图预览（缩略图，点击放大）

### 站点（site-hearthstone）

- 公告详情页由纯文本升级为卡图展示
- prev/curr 双图并排 + base 单图 + group 折叠/展开
- 图片 URL 从条目数据现场派生 renderHash 拼装
