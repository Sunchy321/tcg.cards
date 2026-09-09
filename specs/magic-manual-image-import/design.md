# 万智卡图手动导入细化设计

**日期:2026-09-07**(修订:新增 hunterer 旧来源标注与目录结构压缩包模式;Scryfall 图源过滤 placeholder)
**前置**:[proposals/magic-image-import/design.md](../magic-image-import/design.md) 模块 C(手动替换)的细化与泛化。本文档假设模块 A/B/C 的现状实现(scryfall/gatherer 图片导入任务、手动替换任务)已在线。

## 1. 背景与目标

模块 C 现状:页面「手动替换卡图」,`image_source` 硬编码 `manual`;单张(set+lang+number+face+图片)与 zip(set+lang+压缩包)两种模式;zip 文件名只认「编号」与「编号-面」;经系统 `unzip` 解压;图片与压缩包走 base64 传输。

痛点:

1. 无法指定 scryfall/gatherer 来源做点对点补图/修复,只能动用批量任务;
2. 汉化/水印等第三方图包(mtgch、mtgflame)只能混标为 manual,来源不可追溯;
3. 「编号#名称」等常见命名(如 `001#欧瑞克扫刀手.png` 的汉化包)无法识别,零填充编号 `001` 与库内 `1` 精确匹配不上;
4. 200MB 级压缩包 base64 后约 270MB JSON,传输与内存均不可行;
5. GBK 无 UTF-8 标志的 zip(Windows 打包常见)经系统 `unzip` 解出乱码文件名,全部匹配失败;
6. zip 内编号在库中无匹配行时,文件照写、DB 更新 0 行,产生孤儿文件。

目标:把模块 C 泛化为**手动导入卡图**——来源可选、zip 命名约定自动识别、set/lang 自动推断、路径化传输。

## 2. 来源(source)分组

`source ∈ manual | mtgch | mtgflame | hunterer | scryfall | gatherer`,按导入机制分两组:

- **上传组(manual / mtgch / mtgflame / hunterer)**:本地文件来源(单张或 zip),写入 prints 的 `image_source` 为所选值。前三者区分手工图、mtgch 汉化图、mtgflame 水印图;`hunterer` 用于标注来自已失效旧来源 hunterer 的旧图(上传机制完全相同,仅作为标注值),其压缩包走目录结构模式。
- **下载组(scryfall / gatherer)**:无需上传文件。按 set+lang+number 选定印刷行后取图:`scryfall` 从关联的 `scryfall_cards` 取面级 `image_uris`(多面卡取 `card_faces[i].image_uris`);`gatherer` 从 `magic_data.gatherer` 缓存取静态图 URL(正面 `imageUrls`、背面 `compositeCard.imageUrls`——Scryfall 对多数双面卡只存正面 multiverse id,背面图只能由此获得)。等价于模块 A/B 的「指定编号子集」版。

公共行为:

- 写入 prints 的 `image_source` 为所选值,语义与 A/B 一致:已导过的行不会被批量任务(force=false)重复下载。
- 面号:上传组沿用现有手动输入 faceIndex;下载组由 `scryfall_face` 经 `faceIndexOf` 推导,界面隐藏 faceIndex 输入。
- Scryfall 图源(下载组 `scryfall` 与模块 A)经 `prints.scryfall_card_id` 关联 `scryfall_cards.image_status`,跳过标记为 `placeholder` 的印刷(未印刷/纯数字卡的占位图),计数 `placeholder`。
- 值域分类在代码中以常量组维护(上传组/下载组),不引入新表或新列。

## 3. force 语义(已评审定案;面级判定)

- 页面默认 **force=true**,提供开关(勾掉即「仅补缺」)。
- **面级而非行级**:`image_info` 是按面存储的数组,「缺图」指某个面槽位为空(整列为 NULL、数组短于期望面数、或槽位为 null)。一行只有正面时,背面仍属缺失,`force=false` 必须能补它。
- 期望面数:下载组按数据源计算——`scryfall` 取 `card_faces` 长度(钉扎到单面的 reversible 行取 1);`gatherer` 取缓存行是否有 `compositeCard`(有则 2,否则 1;钉扎行取 1)。
- 筛选规则(A/B 批量任务,上传组=manual/mtgch/mtgflame/hunterer):
  - `force=false`:仅处理仍缺面的行,且**只下载缺失的面**,已导入的面不重下、不改来源;
  - `force=true`:处理全部非上传组行,逐面重下覆盖;
  - 上传组行在任何 force 下都不被下载组覆盖(`skippedUpload` 计数)。
- 手动导入:覆盖判定同样按目标面进行——目标面槽位为空即允许写入,已有图则按来源/force 规则决定(因此不勾 force 也能补背面)。
- 输出计数(A/B):`processed / written / unchanged / failed / missingId / missingUrl / skipped / placeholder / lowQuality / cleanedJpg`;手动导入另含 `skippedUpload / unmatched / unrecognized` 与清单。
- **联动改动**:模块 A/B 的既有硬保护 `image_source is distinct from 'manual'` 扩展为「不在上传组」(`not in (manual, mtgch, mtgflame, hunterer)`),使 mtgch/mtgflame/hunterer 图与 manual 在批量任务下获得同等保护。

## 4. zip 命名约定识别

- **目录结构模式(优先)**:条目路径形如 `{任意前缀}/{set}/{lang}/{编号}[-{面}].webp`(与图库存储结构一致,语言段须为合法 locale)且覆盖率 ≥95% 时,直接按路径解析 set/lang/编号,优先于平面文件名识别;一个压缩包可同时包含多个系列与语言,此时无需填写 set/lang。匹配仍按编号候选集进行,写文件与 DB 更新一律以 DB 行为准。
- 递归收集图片条目(png/jpg/jpeg/webp),忽略 `__MACOSX/`、`._*`、`.DS_Store`、目录与非图片。
- 文件名 stem 按序尝试:
  1. 编号-数字面:`^(?<num>.+)-(?<face>\d+)$`(先于分隔符模式,`-` 不作名称分隔符);
  2. 编号+分隔符+名称:分隔符 `#`、`_`、空格,名称非空,如 `001#欧瑞克扫刀手`;
  3. 纯编号:数字(允许前导零)可带字母后缀,如 `001`、`012a`;
  4. 均不匹配 → 未识别。
- 自动选定:对全部条目做模式统计,**某模式覆盖率 ≥95% 才自动选定**;否则拒绝启动并报告未识别清单。未按选定模式解析的条目进 unrecognized 清单(不导入)。
- 编号归一化:每条目生成候选集 `{原文, 数字部分去前导零}`(`001`→`{001,1}`,`012a`→`{012a,12a}`);DB 匹配用候选集 IN 查询;**写文件与 DB 更新一律以 DB 行的 number 为准**,根治孤儿文件。
- 名称字段只用于校验与推断(§5),不作为匹配依据:与 `print_name` 不一致仅记 warning(民间译名与官方译名不同属常态),不阻断导入。

## 5. set/lang 自动推断(已评审定案交互)

- 交互:用户选定 zip 路径后,runtime 即时分析并**自动填入 set/lang,用户可修改;正式任务开始后以任务输入为准,后端不再改动**。
- 实现:新增 orpc 即时端点(非任务)「分析压缩包」:
  1. 读 zip central directory 条目名(不提取数据),先判目录结构模式(§4),再跑平面命名识别器;
  2. 目录结构模式:set/lang 由路径直接得出(候选列表=路径中的 set/lang 对及其占比),跳过名称推断,表单 set/lang 不需要填写;
  3. 平面模式推断,双信号联合评分:
     - **文件名/目录名信号**:zip 文件名去扩展名、zip 内顶层目录名,与库内 `sets` 表代码匹配(如 `dst.zip` → `dst`);命中即成为 set 的强先验;
     - **名称/编号命中率信号**:以名称集对 prints 粗筛(`print_name IN (…)` 按 set,lang 分组计命中率,名称区分度高,决定 lang 并校验 set),再以编号候选集验证联合命中率;
     - 两信号合并排序得 (set,lang) 候选列表(仅文件名信号命中时 lang 缺失,由名称信号补齐);
  4. 返回:约定、条目数、未识别清单、(set,lang) 候选及命中率。
- UI:最高命中 ≥90% 且唯一则自动填入,否则展示候选列表;两信号均无(纯编号 zip 且文件名不匹配)退回手填;目录结构模式下 set/lang 表单禁用。
- 单张模式无压缩包,不做推断,set/lang/number 手填。
- 名称字段与 `print_name` 不一致仅记 warning(民间译名与官方译名不同属常态),不阻断导入。

## 6. 传输与解压(已评审定案)

- **传输改路径**:`zipBase64` 移除,改为 `zipPath`(本地绝对路径),runtime 同机直读(参照 `orpc.image.getArchive({ filePath })` 既有模式)。单张图片维持 base64。界面提供 **Tauri 原生文件路径对话框**(浏览按钮)+ 可编辑路径文本框,选定即触发 §5 分析。对话框依赖:`@tauri-apps/plugin-dialog`(JS)+ `tauri-plugin-dialog`(Rust crate)+ capability 权限。
- **解压用 `@zip.js/zip.js`**(已验证 Bun 1.4.2 兼容):
  - 用法:经 `new BlobReader(blob)` 显式包装读取(直接传 Blob 在 Bun 下会触发库内流兼容分支报错);
  - 文件名解码:per-reader `decodeText` 钩子拿原始字节,策略「严格 UTF-8 解码,失败回退 GBK」——已验证 UTF-8 包与 GBK 无标志手工包均正确,dst.zip 165 条全对;
  - 性能:仅读 central directory 列条目很快(208MB/165 条约 260ms),数据逐条目流式提取后直接进 `encodeWebp`,无整包解压落盘;
  - 依赖加在 service-desktop-runtime。

## 7. 任务与接口

- 任务类型更名:`magic_manual_image_replace` → **`magic_manual_image_import`**(原类型退役);orpc `createTask.manualImageImport`;stage 沿用单阶段 bounded。
- 输入 schema:
  - 公共:`source(manual | mtgch | mtgflame | hunterer | scryfall | gatherer)`、`force`(默认 true)、`cleanupJpg`(默认 false,写入后清理同名 jpg,与 A/B 一致);`set/lang` 可省略(目录结构压缩包由路径提供);
  - 上传单张:`number`、`faceIndex?`、`fileName?`、`dataBase64`;
  - 上传 zip:`zipPath`;
  - 下载组:`number`。
- 分析端点:`analyzeManualImportZip({ zipPath })` → §5 结果。
- 前端:页面路径不变(`/magic/image-import/manual`),标题与侧栏文案改为「手动导入卡图」;表单按来源与导入方式切换——下载组仅下载,上传组提供单张/压缩包;目录结构模式下 set/lang 表单禁用。
- 输出:§3 计数 + unrecognized/unmatched/warning 清单。

## 8. 数据与投影影响

- 无 schema 变更(`image_source` 为自由 text,值域扩展与 A/B 写值一致)。
- 投影保留规则(库行 `image_source` 非空则 image_* 保留)不受影响:本设计只往已导入语义上叠加,不改变投影判断条件。

## 9. 明确不做(本期)

- front/back 等文字面缀识别、纯名称(无编号)导入;
- 按子目录层级深度递归推断 set(仅顶层目录名与 zip 文件名);
- set+lang+number 多 version 行的精细化选择(沿用现有「匹配行全部更新」语义)。
