# HSData 导入 Profiling 结果汇总

## 概览

- 相同 `sourceTag 56359` 的本地准备耗时从 `55521 ms` 降到 `4024 ms`，下降 `92.8%`。
- 相同 `sourceTag 56359` 的端到端导入耗时从 `70808 ms` 降到 `8528 ms`，下降 `88.0%`。
- 相同 `sourceTag 56359` 的 XML 解析耗时从 `27849 ms` 降到 `2971 ms`，下降 `89.3%`。
- 相同 `sourceTag 56359` 的分块构建耗时从 `21746 ms` 降到 `474 ms`，下降 `97.8%`。
- `R8 -> R9` 的单轮收益仍然明显：`prepare_source` 再降 `17.6%`，`parse_xml` 再降 `21.9%`。
- 当前桌面端本地热点已经稳定转移到 `parse_xml`，其中 `normalizeTagsMs` 是最新第一热点，`snapshot hash` 相关本地耗时已经归零。

## 端到端测试结果

| 轮次 | Source Tag | 场景 | `prepare_source` | `upload_chunks` | `finalize_remote_job` | `total` | 说明 |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| R1 | `86601` | 初始粗粒度 profile | 49342 | 11293 | 1870 | 63308 | 还没有 parse/build 的细分数据 |
| R2 | `56359` | 本地优化前基线 | 55521 | 13492 | 1526 | 70808 | 同一 source 的第一份完整拆解 |
| R3 | `48705` | 完成 normalize/build/source-hash 优化后 | 10064 | 3430 | 597 | 14181 | 不同 sourceTag，用来做横向校验 |
| R4 | `56359` | 完成 normalize/build/source-hash 优化后 | 10527 | 4063 | 654 | 15710 | 同一 source 的可比结果开始稳定 |
| R5 | `56359` | 修正 parse profiling 精度后 | 11897 | 5827 | 747 | 18865 | 第一轮可比较的 parse 子阶段耗时 |
| R6 | `56359` | 改成 direct snapshot-hash canonical writer 后 | 10321 | 5587 | 755 | 17007 | snapshot hashing 明显变快 |
| R7 | `56359` | 缓存 canonical JSON 并复用 chunk 序列化后 | 7905 | 4184 | 932 | 13149 | chunk 构建热点已明显下降 |
| R8 | `56359` | 启用 `sha2-asm` 并替换 JSON 字符串直写后 | 4885 | 3672 | 670 | 9324 | `sha2` 和字符串路径优化后的首轮结果 |
| R9 | `56359` | 本地去重直接比较 `serialized_json` 后 | 4024 | 3693 | 691 | 8528 | 当前最新结果 |

## 相同 `56359` 的准备阶段拆解

| 轮次 | 场景 | `normalize_xml` | `parse_xml` | `build_chunks` | `compute_source_hash` | `prepare_source` |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| R2 | 本地优化前基线 | 211 | 27849 | 21746 | 4868 | 55521 |
| R4 | 完成 normalize/build/source-hash 优化后 | 828 | 5952 | 3424 | 0 | 10527 |
| R5 | 修正 parse profiling 精度后 | 962 | 6887 | 3804 | 0 | 11897 |
| R6 | 改成 direct snapshot-hash canonical writer 后 | 855 | 5761 | 3309 | 0 | 10321 |
| R7 | 缓存 canonical JSON 并复用 chunk 序列化后 | 808 | 5357 | 1513 | 0 | 7905 |
| R8 | 启用 `sha2-asm` 并替换 JSON 字符串直写后 | 278 | 3805 | 485 | 0 | 4885 |
| R9 | 本地去重直接比较 `serialized_json` 后 | 276 | 2971 | 474 | 0 | 4024 |

## 相同 `56359` 的解析热点拆解

| 轮次 | `readEventMs` | `decodeAttributesMs` | `decodeTextMs` | `normalizeTagsMs` | `normalizeExtraPayloadMs` | `serializeSnapshotJsonMs` | `hashSerializedSnapshotMs` | `snapshotHashMs` | `parse_xml` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| R5 | 668 | 334 | 240 | 544 | 23 | n/a | n/a | 4773 | 6887 |
| R6 | 633 | 307 | 217 | 540 | 21 | n/a | n/a | 3760 | 5761 |
| R7 | 572 | 281 | 201 | 1782 | 61 | 141 | 2061 | 2203 | 5357 |
| R8 | 663 | 317 | 225 | 1359 | 56 | 129 | 769 | 899 | 3805 |
| R9 | 683 | 311 | 223 | 1303 | 52 | 114 | 0 | 0 | 2971 |

## 相同 `56359` 的分块构建拆解

| 轮次 | `serializedLineCount` | `serializedLineBytes` | `materializeLineMs` | `updateChunkHashMs` | `appendChunkMs` | `flushChunkMs` | `build_chunks` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| R7 | 9592 | 54904973 | 7 | 1499 | 5 | 0 | 1513 |
| R8 | 9592 | 54904973 | 15 | 463 | 5 | 0 | 485 |
| R9 | 9592 | 54904973 | 13 | 453 | 5 | 0 | 474 |

## 最新 `56359` 的本地热点占比

| 阶段 | 耗时（ms） | 占本地 `prepare_source` 比例 |
| --- | ---: | ---: |
| `parse_xml` | 2971 | 73.8% |
| `build_chunks` | 474 | 11.8% |
| `normalize_xml` | 276 | 6.9% |
| `compute_source_hash` | 0 | 0.0% |

## 最新 `56359` 的解析热点排序

| 排名 | 子阶段 | 耗时（ms） |
| --- | --- | ---: |
| 1 | `normalizeTagsMs` | 1303 |
| 2 | `readEventMs` | 683 |
| 3 | `decodeAttributesMs` | 311 |
| 4 | `decodeTextMs` | 223 |
| 5 | `serializeSnapshotJsonMs` | 114 |
| 6 | `normalizeExtraPayloadMs` | 52 |
| 7 | `hashSerializedSnapshotMs` | 0 |
| 8 | `snapshotHashMs` | 0 |

## 备注

- 之前那次 `prepare_source_parse_xml = 6061 ms` 的 `56359` 结果没有放进可横比表格，因为当时每个子阶段还是按毫秒截断统计，精度还没修正。
- `R7` 说明重复 JSON 序列化已经不再是 `build_chunks` 的主要瓶颈，现在这里几乎全是对现成行字节做 SHA-256。
- `R8` 是开启 `sha2-asm` 并改成 JSON 字符串直写后的第一轮跑数，`updateChunkHashMs` 从 `1499` 降到 `463`，`hashSerializedSnapshotMs` 从 `2061` 降到 `769`。
- `R9` 验证了“本地去重直接比较 `serialized_json`”这一步，`hashSerializedSnapshotMs` 和 `snapshotHashMs` 都已经降到 `0`。
- `R9` 之后，剩余主要瓶颈进一步集中到 XML 解析和 tag 归一化，尤其是 `normalizeTagsMs`、`readEventMs`、`decodeAttributesMs`。
