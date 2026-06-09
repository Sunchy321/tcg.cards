# 炉石图片渲染器协议

## 目的

本文档定义一个炉石卡图渲染器的对外 HTTP 契约。

本文档规定渲染器接口的请求与响应要求，不定义调用方侧的批量拆分、任务编排、轮询或本地导入流程。

## 适用范围

本规范适用于一次同步渲染请求：

- 一次 HTTP 请求只渲染一张图
- 请求体是 JSON
- 成功响应体是 PNG

批量拆分与更高层的任务编排，不属于本规范范围。

## 接口

渲染器必须暴露以下接口：

- `POST /render`
- `GET /status`

### `POST /render`

渲染器必须接收：

- method: `POST`
- 请求 `Content-Type`: `application/json`
- 成功响应 `Content-Type`: `image/png`

对于成功请求，渲染器必须直接在响应体里返回一张 PNG 图片。

### `GET /status`

渲染器必须提供一个状态检查接口，用于服务可用性与协议兼容性检查。

该接口必须接收：

- method: `GET`

该接口必须返回：

- HTTP status: `200`，前提是服务可达且能够报告自身状态
- `Content-Type: application/json`

响应体必须包含以下字段：

- `service`
  稳定的渲染器服务标识。
- `version`
  渲染器实现版本。
- `protocolVersion`
  当前外部渲染器协议的实现版本。
- `requestShape`
  支持的请求对象形态标识。
- `outputFormat`
  成功响应的图片格式。期望值是 `png`。
- `ready`
  渲染器当前是否可以接收渲染请求。
- `message`
  可选的人类可读状态说明。

调用方通过以下条件检查服务可用性与兼容性：

- `GET /status` 是否可达
- `ready` 是否为 `true`
- `protocolVersion`、`requestShape`、`outputFormat` 是否与调用方期望值一致

## 请求模型

请求体必须是一个单图渲染请求对象。

渲染器必须能够从请求体中读取以下最小输入：

- 一个卡牌标识
- `variant`
- 输出宽高
- `renderModel`

当前约定下，卡牌标识可以来自以下任一位置：

- `card.cardId`
- `renderModel.cardId`

当前请求体中，渲染器直接依赖的字段是：

- `variant`
  请求的 zone、template、premium 组合。
- `output`
  输出图片要求。当前协议只要求 `output.width` 与 `output.height`。
- `renderModel`
  用于生成卡图的 canonical render-model 载荷。

`requestId` 可作为调用方追踪字段，但不是渲染成功的前提条件。

`card`、`style`、`target`、`output.fileName` 以及其他导出侧字段可以存在于请求体中，但不属于本规范要求渲染器必须依赖的最小输入集合。

本规范定义的接口只接收单个渲染请求对象，不接收批量 wrapper 文档。

## 功能约束

渲染器必须满足以下行为约束：

- 对一个有效请求返回一个有效 PNG 二进制
- 每次请求只渲染一张图
- 把请求体视为完整、自包含的渲染输入
- 遵守 `output.width` 和 `output.height`
- 支持炉石卡图渲染所需的 `variant` 与 `renderModel`
- 提供 `GET /status` 供可用性与兼容性检查

对于等价的请求载荷，除非渲染器版本或资源集发生变更，否则渲染器应当产出等价的视觉结果。

## 成功响应

成功时，渲染器应当返回：

- HTTP status: `200`
- `Content-Type: image/png`
- body: PNG 字节流

成功响应体只包含 PNG 字节流。

## 失败响应

失败时，渲染器应当返回一个非 2xx 响应。

错误响应体可以是纯文本，也可以是 JSON，但应当包含一条调用方可直接展示或记录的人类可读错误信息，用于诊断。

建议行为：

- `400` 用于非法输入
- `422` 用于请求结构合法但无法渲染
- `500` 用于渲染器自身的意外失败

这些状态码只是建议，不是强制枚举；但渲染器在没有产出有效 PNG 时，不能返回 `200`。

## 范围外

本规范不定义：

- 多图批量提交
- 异步任务
- 任务状态轮询
- 进度事件
- zip 包上传或下载
- 远端存储上传
- 持久化任务历史
- 鉴权或授权
- `/status` 返回字段之外的调用方兼容性策略
- 背景透明度语义
- 导出侧 requirements 文档的完整字段约束

如果需要这些能力，应当通过单独的协议或调用方实现进行定义。

## 实现参考

- 共享上游模型：`packages/model/src/hearthstone/schema/data/image.ts`
