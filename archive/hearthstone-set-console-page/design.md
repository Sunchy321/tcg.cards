# Hearthstone Set 管理页设计

## 1. 背景

当前控制台已有 `Tag` 管理页，可用于维护 `hearthstone.tags` 的配置；但 `hearthstone.sets` 仍缺少对应的管理入口。随着 `set` 的 `dbfId`、`slug`、`rawName` 映射逐步稳定，需要一个专门页面来查看和编辑系列基础信息，避免继续通过 SQL 或临时脚本维护。

## 2. 目标

- 在控制台新增 Hearthstone `set` 管理页
- 支持列表浏览、关键字筛选、单条详情查看与编辑保存
- 支持维护 `setId`、`dbfId`、`slug`、`rawName`、`type`、`releaseDate`、`cardCountFull`、`cardCount`、`group`
- 支持维护 `set_localizations` 中的多语言名称
- 在管理后台导航中暴露入口

## 3. 非目标

- 不在本次页面中处理批量导入或批量生成 SQL
- 不新增新的 `set` 业务字段
- 不在本次页面中维护与 `set` 关联的公告、卡牌或赛制关系
- 不在本次页面中处理图片、补丁或外部数据源的联动操作

## 4. 页面范围

新增页面：

```text
apps/site-console/app/pages/hearthstone/set/index.vue
```

页面结构参考现有 `Tag` 管理页，采用左右双栏：

- 左侧：筛选 + 列表
- 右侧：详情编辑表单

### 4.1 左侧筛选与列表

筛选项包括：

- 关键字 `q`
  - 匹配 `setId`
  - 匹配 `dbfId`
  - 匹配 `slug`
  - 匹配 `rawName`
  - 匹配本地化名称
- `type`
- `group`

列表项展示：

- `setId`
- `dbfId`
- `slug`
- `rawName`
- `type`
- 主名称（优先 `zhs`，回退 `en`，再回退首个 localization）

### 4.2 右侧详情编辑

详情表单字段：

- 只读：`setId`
- 可编辑：`dbfId`
- 可编辑：`slug`
- 可编辑：`rawName`
- 可编辑：`type`
- 可编辑：`releaseDate`
- 可编辑：`cardCountFull`
- 可编辑：`cardCount`
- 可编辑：`group`
- 可编辑：`localization[]`
  - `lang`
  - `name`

交互规则：

- 保存前做基础前端校验
- 数字字段允许为空，空值转为 `null`
- `releaseDate` 允许为空字符串，保持与当前表结构一致
- localization 支持增删行

## 5. 数据接口

新增 ORPC 分组：

```text
apps/site-console/server/orpc/hearthstone/set.ts
```

并注册到：

```text
apps/site-console/server/orpc/hearthstone/index.ts
```

提供三个接口：

- `list`
- `get`
- `update`

其中 `update` 使用事务同时更新 `hearthstone.sets` 与 `hearthstone.set_localizations`。

## 6. Schema 调整

在 `packages/model/src/hearthstone/schema/set.ts` 中补充后台管理所需的输入输出定义：

- `setProfile`
- `setListInput`
- `setListResult`
- `setGetInput`
- `setUpdateInput`

## 7. 导航调整

在：

```text
apps/site-console/app/layouts/admin.vue
```

为 Hearthstone 增加 `Set` 页面入口。

## 8. 风险与注意事项

- 当前 `releaseDate` 在表结构中为必填文本，数据库中可能存在占位空字符串，前端必须允许保存空字符串
- `dbfId` 已被导入与导出逻辑依赖，修改后会影响 `dbf_id -> set_id` 的映射结果
- localization 采用整组重写，需要确保事务下不会留下半更新状态

## 9. 验收标准

- 控制台中存在 `/hearthstone/set` 页面入口
- 可以按关键字、`type`、`group` 浏览 `set` 列表
- 可以查看并编辑单个 `set` 的基础字段
- 可以查看并编辑 `set_localizations`
- 保存后刷新页面可读到最新值
