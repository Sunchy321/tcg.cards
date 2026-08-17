# 炉石前端与 dev 后端同步修复计划

## 待办

- [x] 确认新炉石 schema 与当前前端/API 的差异。
- [x] 修复详情 API 和搜索命令的后端类型错误。
- [x] 修复详情页、搜索页、卡图组件等前端类型错误。
- [x] 修复阻塞 `site-hearthstone lint` 的格式错误。
- [x] 运行 `bun --filter site-hearthstone typecheck` 和 `bun --filter site-hearthstone lint` 验证。

## 执行步骤

1. 对比 `CardEntityView`、`EntityRelation`、前端详情页和搜索命令的字段使用。
2. 将旧数组查询改为适合 JSON object 字段的 SQL 查询。
3. 删除或替换不再存在的详情字段读取。
4. 为前端事件、computed、列表映射和语言索引补齐必要类型。
5. 对 lint 可自动修复的格式问题使用工具修复，对剩余少量问题手动修正。
