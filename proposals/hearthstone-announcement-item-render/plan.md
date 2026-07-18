# 公告条目卡图渲染 实施计划

- [ ] 1. 安装 canonicalize 依赖到 packages/model
- [ ] 2. 创建 computeRenderHash 共享工具函数
- [ ] 3. 添加 delta / glow 表单字段到编辑器的条目卡片
- [ ] 4. 创建 announcement-render.ts 渲染引擎库
- [ ] 5. 创建 ORPC renderItem 和 renderAllItems 路由
- [ ] 6. 在 announcement/index.ts 中注册渲染路由
- [ ] 7. 编辑器：为每个条目卡片添加"渲染"按钮 + 渲染状态指示
- [ ] 8. 编辑器：添加"全部渲染"按钮 + 语言选择器
- [ ] 9. 编辑器：渲染完成后显示卡图预览
- [ ] 10. 站点 API：get 端点 enrich 条目返回 renderHash
- [ ] 11. 站点前端：公告详情页升级为卡图展示
- [ ] 12. 生成数据库迁移（若无新增列，则跳过）
- [ ] 13. 端到端测试：编辑器渲染一条 card_update 条目，站点查看卡图
