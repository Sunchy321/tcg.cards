# 炉石图片 R2 存储与第三方导入实施计划

## TODO List

- [ ] 固化高保真标准与生产标准
- [x] 确认图片变体枚举与默认生成集合
- [x] 定义图片索引与导出记录 schema
- [ ] 定义导入记录 schema
- [x] 生成图片导出相关 Drizzle schema 与 migration
- [ ] 生成图片导入相关 Drizzle schema 与 migration
- [x] 实现固定 WebP 产物的 R2 key 生成工具
- [ ] 实现缺图查询服务
- [ ] 实现控制台缺图查询页面
- [x] 实现需求文件导出服务
- [x] 实现需求文件数量限制与分批导出
- [ ] 实现 PNG ZIP 导入服务
- [ ] 实现 PNG 校验、WebP 转换与 R2 上传
- [ ] 实现图片索引 upsert 与 R2 校验
- [ ] 接入固定 WebP 产物的前端图片 URL 读取规则
- [ ] 后续支持 `zone = play` 图片导出
- [ ] 使用小批量真实卡验证端到端流程
- [ ] 复跑 benchmark 并验证统一 preset 结论
- [ ] 回写规格状态

## 总体策略

先固化“高保真基准标准 + 生产标准 + 固定生产 WebP 产物”，再实现“可查缺图、可导出需求、可导入 PNG ZIP”的人工闭环，最后考虑自动化队列与大规模迁移。

首版不依赖第三方工具 API，只通过文件交互：

```text
基准样本 benchmark
  -> 固化高保真标准与生产标准
控制台缺图查询
  -> 导出 requirements.json
  -> 第三方工具读取 requirements.json
  -> 第三方工具输出 PNG ZIP
  -> 控制台或本地脚本导入 PNG ZIP
  -> 转换为固定 WebP 产物
  -> 上传 R2
  -> 更新 hearthstone_data.card_image_assets
```

## 阶段计划

| 阶段 | 目标 | 核心任务 | 输出物 | 验收标准 |
|------|------|----------|--------|----------|
| P0 标准收口 | 固定标准与生产产物边界 | 确认高保真标准、生产标准、固定 WebP preset、默认公开 URL 与升级策略 | 最终设计结论、标准表 | 标准阈值、固定生产产物、升级规则无歧义 |
| P1 数据模型 | 建立图片索引与批次记录 | 新增 `card_image_assets`、`card_image_exports`、`card_image_imports`；生成 migration | Drizzle schema、migration | 表分类正确，迁移可执行 |
| P2 Key 与变体工具 | 稳定生成身份 | 实现 `imageSpecVersion`、variant key、固定 WebP 的 R2 key、requestId、PNG 文件名生成工具 | image key service | 同一输入稳定输出同一 key 与文件名 |
| P3 缺图查询 | 找出 missing set | 从 `CardEntityView` 生成 expected set，左连资产索引，返回缺图统计与明细 | missing query service | 可按 lang/build/card/variant 查询缺图 |
| P4 控制台页面 | 让运营可操作 | 新增图片页面，支持筛选、统计、分页、导出与导入入口 | `/hearthstone/images` | 可以手动查询缺图、导出需求文件并导入 ZIP |
| P5 需求文件导出 | 给第三方工具任务 | 按缺图查询结果生成 JSON；写入样式选择、renderModel、PNG 文件名、R2 目标；限制数量 | requirements JSON | 文件可被第三方工具读取，且不超过数量上限 |
| P6 PNG ZIP 导入 | 回收第三方输出 | 上传或选择 requirements JSON 与 PNG ZIP，校验文件名、PNG、尺寸，转换 WebP 并上传 R2 | import service / local script | 合规 PNG 可转 WebP 并写入资产索引 |
| P7 前端读取 | 使用新图片路径 | 根据 `renderHash + variant` 生成图片 URL；缺图时保留 fallback | CardImage 调整 | 有图时展示 R2 新图，缺图时不阻断页面 |
| P8 验证与扩展 | 端到端验证 | 选小批量真实卡导出、渲染、导入、展示；复跑 benchmark；记录性能和成本 | 验证记录 | 人工闭环可重复执行，标准结论可复核 |

## 任务拆解

### P0 标准收口

| 序号 | 任务 | 说明 |
|------|------|------|
| 0.1 | 固化高保真标准 | 固定 `excellent / good / review` 逻辑，仅用于基准与回归 |
| 0.2 | 固化生产标准 | 固定 `pass / fail` 条件、`passRate >= 0.95` 门槛与生产成本分 |
| 0.3 | 确认固定生产产物 | 当前固定 `q86-m4-fast + webp` |
| 0.4 | 确认首版变体 | 默认 `hand/normal/normal`，其余按需导出 |
| 0.5 | 确认 R2 bucket 与公开 URL | 明确 `assetBaseUrl` 与生产 R2 key / URL 规则 |
| 0.6 | 确认升级策略 | 生产 preset 变化时通过 `imageSpecVersion` 隔离旧产物 |
| 0.7 | 确认第三方文件协议 | 确认工具接受 requirements JSON，并按指定文件名输出 PNG ZIP |

### P1 数据模型

| 序号 | 任务 | 说明 |
|------|------|------|
| 1.1 | 新增 `card_image_assets` | 归类为 `hearthstone_data`；记录 R2 图片资产索引 |
| 1.2 | 新增 `card_image_exports` | 归类为 `hearthstone_data`；记录需求文件导出批次 |
| 1.3 | 新增 `card_image_imports` | 归类为 `hearthstone_data`；记录 PNG ZIP 导入批次 |
| 1.4 | 添加枚举或 text 约束 | `zone/template/premium/status` 首版可用 text + zod 校验，DB check 可选 |
| 1.5 | 生成 migration | 先改 Drizzle schema，再用 `drizzle-kit generate` |

### P2 Key 与变体工具

| 序号 | 任务 | 说明 |
|------|------|------|
| 2.1 | 实现 variant schema | 使用 Zod 定义 `zone/template/premium` |
| 2.2 | 实现 R2 key builder | 生成 `hearthstone/card-images/{version}/.../{renderHash}.webp` |
| 2.3 | 实现 requestId builder | 使用 `imageSpecVersion + renderHash + variant` 计算稳定 ID |
| 2.4 | 实现 PNG 文件名 builder | 根据 requestId 生成安全、唯一、可匹配的 `.png` 文件名 |
| 2.5 | 增加单元测试 | 覆盖 key、prefix、requestId、文件名的稳定性 |

### P3 缺图查询

| 序号 | 任务 | 说明 |
|------|------|------|
| 3.1 | 定义查询输入 | `lang/cardId/build/isLatest/zone/template/premium/status/limit` |
| 3.2 | 生成 expected set | 从 `CardEntityView` 读取 `renderHash/renderModel`，再与旧版兼容样式集合求交 |
| 3.3 | 查询 missing set | 与 `card_image_assets` 做 left join 或在服务层 merge |
| 3.4 | 返回统计 | 输出 expected、ready、missing、failed、stale 数量 |
| 3.5 | 分页与上限 | 防止一次返回过大任务 |

### P4 控制台页面

| 序号 | 任务 | 说明 |
|------|------|------|
| 4.1 | 新增页面入口 | `/hearthstone/images` |
| 4.2 | 增加筛选表单 | 支持语言、build、cardId、变体 |
| 4.3 | 增加统计卡片 | 展示覆盖率与缺失数量 |
| 4.4 | 增加标准信息区 | 展示当前固定生产 preset 与高保真 benchmark 结论 |
| 4.5 | 增加缺图表格 | 展示 cardId、lang、variant、renderHash、r2Key |
| 4.6 | 增加导出按钮 | 使用当前筛选条件生成 requirements JSON |
| 4.7 | 增加导入入口 | 上传 requirements JSON 与 PNG ZIP |

### P5 需求文件导出

| 序号 | 任务 | 说明 |
|------|------|------|
| 5.1 | 定义导出接口 | `exportMissingImageRequirements(input)` |
| 5.2 | 实现数量限制 | 默认上限 `200`，硬上限 `500`，超出时返回剩余数量和下一批入口 |
| 5.3 | 生成文件元信息 | 写入 schema、exportId、imageSpecVersion、generatedAt、limits |
| 5.4 | 生成 request 列表 | 每项包含 card 元数据、variant、style、output.fileName、target.r2Key、renderModel |
| 5.5 | 写入导出记录 | 写 `card_image_exports` |
| 5.6 | 支持下载 | 控制台直接下载 JSON，内部保存为可选能力 |

### P6 PNG ZIP 导入

| 序号 | 任务 | 说明 |
|------|------|------|
| 6.1 | 定义导入接口 | `importImageArchive(requirementsFile, archiveFile)` |
| 6.2 | 校验需求文件 | 校验 schema、exportId、imageSpecVersion、requestCount、maxRequestCount |
| 6.3 | 校验 ZIP | 检查文件数量、文件名、路径穿越、重复文件、未知文件和压缩包大小 |
| 6.4 | 校验 PNG | 检查 magic bytes、解码结果、尺寸和透明通道基础信息 |
| 6.5 | 转换 WebP | 使用固定 `q86-m4-fast` preset 转换 PNG |
| 6.6 | 上传 R2 | 重新计算 R2 key，上传 WebP，禁止不同 sha256 静默覆盖 |
| 6.7 | upsert assets | 成功写 `ready`，缺失或失败写 `failed` 或保持 missing |
| 6.8 | 写入导入记录 | 写 `card_image_imports`，统计 imported/missing/rejected |
| 6.9 | 可选 R2 HEAD | 对成功结果抽样或按开关 HEAD 校验 |

### P7 前端读取

| 序号 | 任务 | 说明 |
|------|------|------|
| 7.1 | 扩展 `CardImage` 输入 | 支持 `renderHash` 与图片变体 |
| 7.2 | 生成新图片 URL | 使用固定生产 URL 规则 |
| 7.3 | 保留旧图 fallback | 新图缺失时不让页面 404 |
| 7.4 | 支持变体选择 | 映射现有普通/金卡/钻石/异画选择到 `premium` |
| 7.5 | 支持 `play` 导出 | 后续补充对战区图片的尺寸、模板与 eligibility 规则 |

### P8 验证与扩展

| 序号 | 任务 | 说明 |
|------|------|------|
| 8.1 | 小批量导出 | 选 10 张卡，导出默认变体 |
| 8.2 | 第三方工具试跑 | 验证 requirements JSON 是否足够 |
| 8.3 | PNG ZIP 导入 | 导入完整、部分缺失和含未知文件三类 ZIP |
| 8.4 | 页面展示验证 | 确认新图 URL 可展示 |
| 8.5 | benchmark 复核 | 复跑 quality 脚本，验证固定生产 preset 结论 |
| 8.6 | 成本评估 | 记录 R2 对象数量、平均大小、导出耗时、转换耗时 |

## 验收标准

- 可以在控制台查询缺失图片
- 可以按筛选条件导出 requirements JSON
- 单个 requirements JSON 不超过默认上限或显式允许的硬上限
- 第三方工具可以只凭 requirements JSON 完成 PNG 渲染
- 第三方工具返回的 ZIP 可以被控制台或本地脚本导入
- PNG 会在导入端转换为固定 WebP 产物并上传 R2
- 成功结果会写入 `hearthstone_data.card_image_assets`
- 前端可以通过 `renderHash + variant` 计算图片 URL
- 新图缺失时页面有 fallback，不阻塞卡牌详情

## 预计风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 任务量过大 | 需求文件和 PNG ZIP 过大 | 默认上限、硬上限、分页导出、分批导入 |
| ZIP 不安全 | 路径穿越、zip bomb、重复文件 | 解压前限制、文件名白名单、拒绝未知文件 |
| PNG 不合规 | 尺寸错误或无法转换 | 校验 PNG magic bytes、尺寸、解码结果 |
| R2 索引不一致 | 控制台显示 ready 但图片不可访问 | 手动 HEAD 校验，后续定时 reconcile |
| 变体语义变化 | 已生成路径失效 | 使用 `imageSpecVersion` 隔离 |
| 标准过严或过松 | 固定生产 preset 不稳定 | 保留高保真标准，定期复跑 benchmark，必要时升级 `imageSpecVersion` |
| 第三方输出不可信 | 错误文件污染导入流程 | 服务端重新计算 key，只接受需求文件声明的文件名 |
| 转换耗时过高 | 导入阻塞控制台 | 限制批次，本地脚本并行，后续后台任务化 |
