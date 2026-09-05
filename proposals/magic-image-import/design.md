# 万智卡牌图片导入(三模块)设计

**日期:2026-09-05**
前置实验结论见 `docs/magic/card-image-experiments.zh-CN.md`(q50-m4 定稿、png 图源定稿、细节损失率 0.75、prints 字段已落)。

## 1. 范围与目标

在 desktop runtime(app-console-desktop 前端)实现三块卡图导入,产物统一为 **webp(q50-m4,保持来源分辨率,含 alpha)** 写入 `magic.image.card` 目录,并把结果元数据合并进本地 `magic.prints`(不直接写远程库;远程经既有 publish 流程)。

- **模块 A Scryfall 导入**:抓官方 png(745×1040 RGBA)→ 转 q50 webp;支持**全量**与**指定 set**。
- **模块 B Gatherer 爬取**:仅**指定 set**,从本地 prints 的 multiverseId 抓 gatherer 图;质量不做保证,由质量判定标档。
- **模块 C 手动替换**:支持**单张图片**与**zip 压缩包**;结果 `image_source='manual'`,模块 A/B 及投影均不得覆盖。

三模块结果都写 prints 的同一组字段(image_*),都"参与投影"语义:投影重复运行时保留已导入的本地图字段(见 §5)。

## 2. 数据流(通用)

```
任务(scope 行列表)
  → 逐行取候选源(Scryfall png url / gatherer multiverseid / 手动上传字节)
  → 下载/解码 → cwebp -q 50 -m 4 → sha256 幂等去重 → 写 bucket 文件
  → 质量判定(尺寸档 + 细节损失率,阈值 0.75)→ 写 prints 行(image_* 列)
```

- 文件命名(与既有目录/UI 约定一致):`<bucket>/large/{set}/{lang}/{number}.webp`;多面(face uris>1)按 `{number}-{faceIndex}.webp`。
- 更新条件:按 prints PK(cardId,version,set,number,lang,source)定位;**模块 A/B 跳过 `image_source='manual'` 的行**;sha 相同跳过写盘。
- 写 prints 的列:`image_sha256/image_width/image_height/image_byte_size/image_source/image_quality_score/image_verified_at`,以及 `image_status`(本地档位:highres_scan|lowres,由质量判定写)与 `image_type='webp'`。不写 `image_updated_at` 等 scryfall 域字段。

## 3. 质量判定(TS 内实现)

- 尺寸档:短边 < 370 → `lowres`,不跑指标;
- 否则跑细节损失率(灰度拉普拉斯能量自降采样 1/4 还原比值,阈值 0.75,同实验文档 §4):≥0.75 → `highres_scan`,否则 `lowres`;
- 数值写入 `image_quality_score`(0–1)。

## 4. 任务与界面

- 任务类型(desktop runtime task 框架,注册于 `task-definitions.ts`):
  - `magic_scryfall_image_import`(A)
  - `magic_gatherer_image_import`(B)
  - `magic_manual_image_replace`(C,单张与 zip 同一任务,输入区分 mode)
- orpc:`orpc.magic.createTask.{scryfallImageImport,gathererImageImport,manualImageReplace}`(沿用 createAndRunTask 模式,每类型同时仅一个活跃运行)。
- 前端:`/magic/image-import` 单页三区块(A 全量/指定 set;B 指定 set;C 单张/zip 上传,含 set/lang/number 表单);左侧边栏(magic 组)新增"卡图导入"入口;页面复用 TaskController/TaskResultCard 模式。

## 5. 投影保留规则

`magic_project` 重复运行时,upsert prints 不得用 scryfall 草稿覆盖**已存在本地图**的行:若库里该行 `image_source` 非空(任一模块已写过),image_* / image_status / image_type 全部保留现值;仅当行无本地图时才写投影默认值(image_status 等 scryfall 原值)。手动替换(manual)优先级由此天然满足。

## 6. 明确不做(本期)

- 不下载/不管理 jpg 母本(删档/NAS 归档另行);
- 不做在线质量抽检报告 UI;不接 CDN;
- gatherer 图源不做 png 形态(官方无)。
