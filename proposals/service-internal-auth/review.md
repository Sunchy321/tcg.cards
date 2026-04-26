# service-internal 登录服务评审

## 评审结论

建议按当前方案实施。

## 通过理由

1. 方案满足既有规格中“Auth API 统一收敛到 `service-internal`”的方向
2. 通过同源转发避免了第一阶段直接引入浏览器跨服务登录复杂度
3. 共享 auth 工厂能够减少 `site-console` 与新服务之间的重复实现
4. 使用 `Hono + Worker` 与“内部服务”语义更一致，不再引入不必要的页面运行时
5. 不引入数据库迁移，实施风险可控

## 主要风险

### 1. 这不是全仓统一迁移

本次只让 `site-console` 接入 `service-internal`，因此仓库里仍会暂时存在其他站点的本地 auth 配置。

### 2. 代理链路会增加一个网络跳转

`site-console` 的 `/api/auth/*` 调用会多一层服务转发，但这比直接让浏览器跨服务访问更稳妥。

### 3. 需要明确环境变量职责

`site-console` 必须知道 `service-internal` 的地址，否则代理无法工作。

## 结论建议

先落地本次最小版本，后续再按客户端逐步迁移到 `service-internal`。
