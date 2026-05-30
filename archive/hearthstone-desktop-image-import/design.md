# 桌面端炉石图片导入与本地渲染端联动设计

> 稳定的运行时边界、数据归属和工作区职责以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只描述桌面端炉石图片导入能力的需求级设计；若有冲突，以主架构文档为准。

## 背景

当前炉石图片系统已经具备两条能力：

- Web 控制台可以导出缺失图片需求文件，并支持上传第三方返回的 ZIP，再由浏览器端转 WebP 并回写远端索引与 R2
- 本地脚本可以把需求文件对应的 PNG 结果写入本地 bucket 目录，模拟 R2 key 结构

但桌面端仍然缺一条完整的本地工作流：

- `apps/app-console-desktop/src/pages/hearthstone/image/index.vue` 仍是占位页
- 桌面端没有图片导出、任务提交、结果导入和本地落盘入口
- 桌面 runtime 没有面向图片渲染端的本地网络协议
- 桌面配置里也没有图片渲染服务地址和本地图片 bucket 根目录

这导致本地全量卡图工作流仍然需要在 Web 控制台和命令行之间切换，不适合桌面端承担“本地数据处理与本地资产落盘”的职责。

## 目标

- 为桌面端新增炉石图片管理页面
- 页面布局、筛选项、状态反馈尽量与 Web 控制台图片页保持一致
- 桌面端不提供 ZIP 选择、上传和浏览器内转码流程
- 桌面端通过可配置的本地网络地址连接已经启动的渲染端
- 桌面 runtime 负责把需求批次发送给渲染端、接收结果、执行本地导入并写入本地 bucket 目录
- 本地 bucket 目录中的图片可以再作为独立同步源推送到远端 R2
- 桌面端提供本地图片 bucket 根目录配置，形成可运行的本地闭环

## 非目标

- 不在本轮重做 Web 控制台图片页
- 不在本轮支持桌面端直接上传远端 R2
- 不在本轮支持桌面端导入 ZIP 文件
- 不在本轮把渲染端嵌入桌面应用进程
- 不在本轮设计跨公网或鉴权复杂的远程渲染协议
- 不在本轮新增数据库表

## 现状

### 1. Web 控制台已经有完整图片管理页面

现有页面支持：

- 选择语言、版本、卡牌 ID、zone、template、premium
- 导出 requirements JSON
- 上传第三方 ZIP
- 浏览器内转 WebP 后通过 oRPC 导入

该页面可以作为桌面端 UI 的主要参考。

### 2. 桌面端已有本地 runtime RPC 通道

桌面前端当前通过 `VITE_DESKTOP_RUNTIME_RPC_URL` 指向本地 Bun runtime，例如：

- `http://localhost:4318/rpc`

桌面配置变化会通过 Tauri 侧定时同步到 desktop runtime。

### 3. 本地导入脚本已经具备关键导入逻辑

现有本地脚本已经可以：

- 读取 requirements JSON
- 校验 PNG 文件名和尺寸
- 使用 `cwebp` 转 WebP
- 按 R2 key 规则写入本地 bucket 目录

这说明“本地导入并按类 R2 路径落盘”已经有稳定规则，但还没有 runtime 级服务化入口。

### 4. 桌面配置缺少图片相关配置

当前桌面配置只包含：

- hsdata repo path
- publish target
- 外部数据库连接

尚未包含：

- 渲染端服务地址
- 本地图片 bucket 根目录

## 设计决策

### 1. 桌面端图片页复用 Web 控制台页面结构

桌面端图片页应尽量与 Web 控制台保持一致，保留以下部分：

- 页面标题与说明
- 图片筛选表单
- 导出需求区域
- 当前任务结果摘要
- 当前协议说明与限制说明

但桌面端要移除或替换以下部分：

- 移除 ZIP 选择和上传控件
- 移除浏览器内 Wasm 转码说明
- 替换为“连接渲染端”和“提交本地渲染导入任务”的状态区

这样可以降低认知切换成本，也避免维护两套完全不同的操作模型。

### 2. 桌面端图片工作流改为“导出需求 + 发送到渲染端 + 本地导入”

桌面端流程固定为：

1. 前端按现有筛选条件向 desktop runtime 请求导出 requirements
2. desktop runtime 基于本地或远端数据库生成 requirements JSON
3. desktop runtime 通过本地网络把 requirements 批次发送给渲染端
4. 渲染端返回对应请求的 PNG 结果
5. desktop runtime 复用本地导入校验与转码逻辑，把 PNG 转 WebP 后写入本地 bucket 目录
6. runtime 把导入结果、缺失数和错误列表返回前端

桌面端不再要求用户手工下载 JSON、等待 ZIP、再手工导入。

### 3. 渲染端协议使用桌面 runtime 发起的本地 HTTP 请求

桌面 runtime 与渲染端之间采用本地网络 HTTP 协议，而不是前端直接访问渲染端。

这样做的原因：

- 避免前端直接处理大体积 PNG 二进制
- 便于把本地 bucket 写入、PNG 校验和 `cwebp` 转码都收口在 runtime
- 可以在 runtime 内统一超时、错误处理和日志
- 后续如果渲染端协议升级，只需要调整 runtime 适配层

首版协议建议最小化，包含两类调用：

- `POST /render/hearthstone/card-image-requirements`
  - 请求体：requirements JSON
  - 返回：任务受理结果，至少包含 `jobId`
- `GET /render/jobs/{jobId}`
  - 返回任务状态、完成结果和 PNG 文件负载获取方式

为了让首版闭环尽量简单，建议渲染端完成后直接返回一个结构化结果：

- `status`
- `completedCount`
- `missingCount`
- `rejected`
- `files`

其中 `files` 为按 `requestId` 分组的 PNG 二进制内容或可下载 URL。

首版更推荐返回“可下载 URL 列表”而不是把全部 PNG 直接塞进单个状态响应，以避免状态查询响应过大。

### 4. 桌面 runtime 内新增图片渲染客户端，而不是复用 Web oRPC 导入接口

现有 Web 图片导入逻辑依赖：

- 浏览器上传的 file 对象
- Cloudflare Worker 的 R2 环境绑定

这些边界不适合桌面 runtime 直接复用。

桌面 runtime 应新增独立图片模块，职责包括：

- 导出 requirements
- 调用渲染端
- 拉取 PNG 结果
- 校验 PNG
- 调用 `cwebp`
- 写本地 bucket 目录
- 汇总导入结果

其中“写本地 bucket 目录”的规则必须与现有本地脚本保持一致。

### 5. 本地 bucket 根目录成为桌面端正式配置项

桌面端必须新增炉石图片配置：

- `games.hearthstone.image.rendererBaseUrl`
- `games.hearthstone.image.bucketDir`

理由如下：

- 没有 `rendererBaseUrl`，桌面页无法发起渲染端调用
- 没有 `bucketDir`，即使渲染端完成返回，runtime 也无法落地本地产物

两者都属于炉石图片工作流的本地运行配置，归在 `games.hearthstone.image` 下最清晰。

### 6. 桌面配置同步要把图片配置注入 desktop runtime

当前 Tauri 已经会把数据库连接、hsdata repo 和 publish target 同步到 desktop runtime。

本轮需要把以下字段一并同步：

- `games.hearthstone.image.rendererBaseUrl`
- `games.hearthstone.image.bucketDir`

这样前端不需要手工把配置参数带给每个 runtime RPC，runtime 也能在后台任务或轮询过程中读取统一配置。

### 7. 导入逻辑优先抽成 runtime 可复用模块，再由脚本和 runtime 共用

现有本地脚本已经实现了主要逻辑，但它是 CLI 入口，不适合作为 runtime 直接调用。

本轮建议把“本地导入核心逻辑”收敛成共享模块，至少覆盖：

- request 校验
- PNG 尺寸校验
- `cwebp` 转换
- 输出 key 计算
- 本地 bucket 写入

然后：

- CLI 脚本继续作为命令行封装
- desktop runtime 调用同一核心模块

这样可以避免脚本和 runtime 分叉出两套规则。

### 8. 桌面端首版采用单任务串行模型

首版不做复杂任务队列，只支持：

- 当前页面一次触发一个导出-渲染-导入任务
- 前端显示当前任务状态、成功数、缺失数、拒绝数
- 任务运行时禁止重复提交

这样能显著降低状态复杂度，也更符合当前桌面端其他本地处理页的实现模式。

### 9. 任务进度以 runtime 事件或轮询状态返回

桌面页需要看到最少这些阶段：

- `exporting_requirements`
- `submitting_renderer_job`
- `waiting_renderer`
- `downloading_pngs`
- `importing_local_bucket`
- `completed`
- `failed`

实现上有两种可行方式：

- runtime 事件推送
- 前端轮询 runtime 任务状态

首版更推荐 runtime 事件推送，因为桌面端已经有 hsdata 进度事件经验；但如果图片任务实现成本更低，允许先用轮询。

### 10. 本地 bucket 到 R2 同步作为独立动作

如果用户希望把本地渲染结果继续推送到远端 R2，建议把这件事设计成独立同步动作，而不是并入“本地渲染导入”主任务。

推荐流程是：

1. 桌面端先完成本地渲染与本地 bucket 落盘
2. 用户按需触发“同步到 R2”
3. runtime 扫描本地 bucket 目录，并按相同 key 上传到远端 R2
4. 同步过程按 `r2Key` 和内容 hash 做幂等判断，内容一致则跳过

这样拆开的原因是：

- 本地闭环和远端发布是两种不同目标
- 远端同步失败不应破坏本地已生成结果
- 远端同步可以独立重试，不需要重新渲染
- 后续更容易扩展成增量同步或批量发布工具

## 数据与边界

### 1. 不新增数据库表

桌面本地导入的目标是：

- 落地图像文件到本地 bucket 目录

首版不要求把本地导入结果写回远端 `card_image_assets`，也不要求给本地数据库新建图片任务表。

导入结果只作为 runtime 返回值和前端短期状态展示。

### 2. 本地 bucket 路径规则保持与现有 R2 key 一致

写入路径继续使用：

```text
hearthstone/card/{imageSpecVersion}/{zone}/{template}/{premium}/{hashPrefix}/{renderHash}.webp
```

这能保证：

- 本地资源目录和远端对象 key 完全同构
- 站点前端通过切换 `assetBaseUrl` 就能复用同一路径规则
- 本地静态资源目录后续可以直接映射到本地 HTTP server 或对象存储模拟器

### 3. 同步到 R2 时仍然使用完全相同的对象 key

如果从本地 bucket 推送到 R2，远端对象 key 不做任何转换，直接复用本地相对路径：

```text
hearthstone/card/{imageSpecVersion}/{zone}/{template}/{premium}/{hashPrefix}/{renderHash}.webp
```

这样可以保证：

- 本地目录和远端对象空间完全同构
- 同步逻辑只需要上传文件，不需要重写 key
- 站点前端读取规则不需要区分“本地生成”还是“远端上传”

## 页面方案

### 1. 桌面端图片页

保留以下区域：

- 导出条件表单
- 变体勾选
- 当前规则说明
- 最近一次任务结果摘要

新增以下区域：

- 渲染端连接状态
- 本地 bucket 配置提示
- 启动渲染导入任务按钮
- 当前任务进度卡片

移除以下区域：

- ZIP 选择
- ZIP 上传
- 浏览器端导入结果文件处理说明

### 2. 炉石设置页

新增图片配置卡片：

- 渲染端 Base URL
- 本地图片 bucket 根目录
- 可选的“测试渲染端连接”按钮
- 可选的目录选择器

该卡片应放在 `Hearthstone 设置` 页，而不是单独新建全局设置页。

## 实施步骤

### 1. 补充 proposal 包

- 固定桌面图片页边界
- 固定渲染端通信模式
- 固定新增配置项

### 2. 改造桌面配置

- 为 `games.hearthstone.image` 增加配置字段
- 更新 Tauri 读写配置命令
- 更新前端设置 composable 和 schema

### 3. 改造 desktop runtime

- 增加图片配置读取与注入
- 新增图片 requirements 导出 RPC
- 新增渲染端客户端与任务状态管理
- 新增本地 bucket 导入 RPC 或任务接口

### 4. 提炼共享导入核心

- 从现有 CLI 脚本中提炼 PNG 校验、WebP 转换和本地写入逻辑
- 保持 CLI 和 runtime 共用同一规则

### 5. 实现本地 bucket 到 R2 同步

- 新增独立同步命令或 RPC
- 扫描本地 bucket 根目录下的炉石图片对象
- 计算对象 key 与内容 hash
- 上传到远端 R2
- 返回同步数量、跳过数量和失败明细

### 6. 实现桌面端前端

- 将占位页替换为图片管理页
- 页面结构尽量对齐 Web 控制台
- 接入 runtime 客户端、任务状态与错误展示

### 7. 验证

- 验证配置保存与 runtime 注入
- 验证渲染端连接失败路径
- 验证小批量导出并写入本地 bucket
- 验证本地 bucket 可以按相同 key 同步到远端 R2
- 验证缺失文件、尺寸错误和转换失败三类错误路径

## 风险与取舍

### 1. 渲染端协议仍是新增边界

当前仓库内没有现成的渲染端 HTTP 协议实现，因此首版需要同时定义协议与客户端。

为控制范围，本轮只定义桌面 runtime 需要的最小字段，不做通用渲染平台抽象。

### 2. 本地 `cwebp` 依赖仍然存在

现有本地脚本依赖 `cwebp`。桌面 runtime 如果复用同样逻辑，就仍然需要：

- 本机安装 `libwebp`
- runtime 能调用系统命令

首版接受这个依赖，不在本轮引入内嵌编码器或 Wasm 转码。

### 3. 不写数据库意味着状态不可持久恢复

桌面页刷新后，正在运行的图片任务状态可能丢失，除非 runtime 单独保留内存任务表。

首版可以接受“页面刷新丢失前端瞬时态”，但 runtime 至少要能在任务完成时返回最终摘要。

### 4. 与 Web 页保持一致是“尽量一致”，不是完全复刻

桌面端工作流和 Web 端本质不同：

- Web 端偏人工文件交换
- 桌面端偏本地服务编排

因此只保证筛选表单、状态反馈和操作布局尽量相近，不追求所有控件一一对应。
