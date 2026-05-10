# desktop hsdata 分块导入任务评审

## 结论

当前设计已经把最关键的边界收口清楚，可以进入实现。

本轮收口后的关键点如下：

- 明确采用“受信任 desktop 导入器”边界
- `sourceHash` 保留为客户端声明的原始来源 hash，不要求服务端独立验证其与 staged snapshot 的可逆对应关系
- `snapshotHash` 明确收口为服务端基于标准化 snapshot 内容重算的值
- `importEngineVersion` 被纳入任务元数据和正式来源版本元数据，用于后续识别需要全量重导的数据
- 解析器或标准化规则变化时，通过全量重新导入修正历史数据

## 备注

后续实现时需要严格按以下边界落代码：

- 服务端只验证：
  - `manifestHash`
  - `payloadHash`
  - chunk / staging 内容自洽
- 服务端不能直接信任客户端上传的 `snapshotHash`
- `sourceHash` 的角色是来源溯源和兼容字段，不是服务端可独立证明的事实
- `importEngineVersion` 需要贯穿：
  - job 创建
  - finalize 落正式元数据
  - 后续重导筛查

## 总结

可以进入实现。
