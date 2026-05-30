# 桌面端炉石图片导入与本地渲染端联动实施计划

> 稳定的运行时边界、数据归属和工作区职责以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只记录本需求的实施计划；若有冲突，以主架构文档为准。

## TODO List

- [x] 新增中文 proposal 包，固定桌面端图片导入与渲染端联动方案
- [x] 为桌面配置新增炉石图片配置字段与 schema
- [x] 让 Tauri 配置读写与 runtime 配置同步携带图片配置
- [x] 提炼本地图片导入共享核心，复用 CLI 的校验与落盘规则
- [x] 在 desktop runtime 中新增图片 requirements 导出接口
- [x] 在 desktop runtime 中新增本地图片导入接口
- [x] 在 desktop runtime 中新增渲染任务提交与当前状态接口
- [x] 在 desktop runtime 中实现渲染结果拉取并接入本地导入
- [ ] 新增本地 bucket 到 R2 的独立同步命令或 RPC
- [x] 将桌面端炉石图片页替换为可用的管理页面（筛选表单 + 渲染提交 + 事件流进度 + 本地导入 + CardImageAsset 同步）
- [x] 在桌面端设置页加入渲染端地址和 bucket 目录配置与渲染端状态检测
- [x] 导出循环按 limit 提前终止，避免小批量扫描全表
- [x] 运行定向验证，确认桌面端能够通过渲染端写入本地 bucket

## 实施步骤

### 1. 固定配置模型

- 在桌面配置中新增 `games.hearthstone.image.rendererBaseUrl`
- 在桌面配置中新增 `games.hearthstone.image.bucketDir`
- 更新前端 `desktopConfigSchema`
- 更新 Tauri 结构化读取和写入逻辑

### 2. 打通配置同步

- 在 Tauri -> desktop runtime 的同步载荷中加入图片配置
- 在 desktop runtime 中提供统一读取入口
- 保证图片任务不需要前端重复传递配置字段

### 3. 提炼共享导入核心

- 从现有本地 CLI 导入脚本中拆出共享模块
- 共享模块负责 request 校验、PNG 校验、`cwebp` 转换和 bucket 写入
- CLI 继续作为命令行封装使用该共享模块
- runtime 也调用同一共享模块

### 4. 实现 desktop runtime 图片任务

- [x] 新增图片 requirements 导出过程
- [x] 新增渲染端 HTTP 客户端（单图同步 POST /render → PNG）
- [x] 新增图片任务状态模型（ImageJobState + ImageJobProgressEvent）
- [x] 新增任务提交 RPC（异步返回 + 后台执行）
- [x] 新增事件流进度推送（ORPC eventIterator + pub/sub）
- [x] 失败路径统一返回结构化错误
- [x] 导入成功后写入 CardImageAsset 表

### 5. 实现本地 bucket 到 R2 同步

- [ ] 新增独立同步命令或 RPC
- [ ] 扫描本地 bucket 根目录
- [ ] 读取文件内容 hash 与对象 key
- [ ] 幂等上传到远端 R2
- [ ] 返回同步统计与失败明细

### 6. 实现桌面端图片页

- [x] 替换当前占位页
- [x] 筛选表单（语言、版本、cardId、区域、模板、品质、limit、cursor）
- [x] 渲染端连接状态检测与展示
- [x] 任务提交按钮 + 事件流驱动的实时进度条
- [x] 已消耗时间 + 预计剩余时间
- [x] 接入 desktop runtime RPC（submitRenderJob + watchJobProgress）
- [x] 跳过 ZIP 导入控件（桌面端走本地 bucket）

### 7. 实现设置页扩展

- [x] 在 `Hearthstone 设置` 页增加图片配置卡片
- [x] 支持输入渲染端 Base URL（默认 http://localhost:58437）
- [x] 支持输入或选择 bucket 根目录
- [x] 支持渲染端连接测试（GET /status 协议检测 + ready 状态）

### 8. 验证

- 验证桌面配置保存后能同步到 runtime
- 验证渲染端不可达时页面提示清晰
- 验证小批量图片任务能完成导出、渲染和本地落盘
- 验证本地 bucket 可以独立同步到 R2
- 验证缺失 PNG、尺寸错误和 `cwebp` 失败路径
- 验证生成路径与现有 R2 key 规则一致
