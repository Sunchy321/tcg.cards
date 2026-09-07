# 万智卡图手动导入细化 — 实施计划

**规格**:同目录 [design.md](./design.md)(已评审定案)。
**范围**:service-desktop-runtime(runtime)、app-console-desktop(前端 + Tauri)。无数据库 schema 变更,无迁移。

## Todo 清单

- [x] 1. runtime 增加 `@zip.js/zip.js` 依赖
- [x] 2. 实现 zip 读取工具(条目名列表 + 单条目提取,`BlobReader` 包装,`decodeText` 钩子严格 UTF-8→GBK 回退,忽略 `__MACOSX/`、`._*`、`.DS_Store`、目录与非图片)
- [x] 3. 实现命名约定识别器(编号-面 / 编号#名称 / 纯编号模式统计 ≥95% 自动选定,编号候选集去前导零,未识别清单)+ 单元测试
- [x] 4. 上传组常量(manual/mtgch/mtgflame)与 A/B 硬保护扩展(`not in 上传组`)
- [x] 5. 新任务 `magic_manual_image_import`(上传单张 / 上传 zip / 下载组,force 语义,以 DB 行 number 写文件,输出计数 + 清单)
- [x] 6. 注册新任务并移除旧任务注册与 `manual-image-replace` 定义
- [x] 7. orpc `analyzeManualImportZip` 端点(条目名识别 + set/lang 双信号推断:文件名/顶层目录名对 sets 表、名称命中率+编号验证)
- [x] 8. orpc `manualImageImport` 端点替换 `manualImageReplace`
- [x] 9. Tauri 原生文件对话框(`@tauri-apps/plugin-dialog` JS 依赖、`tauri-plugin-dialog` crate、capability 权限、lib.rs 注册)
- [x] 10. 前端页面改版(标题「手动导入卡图」,来源分组表单,force 默认 true,zip 路径选择+分析预填,下载组隐藏文件选择与 faceIndex)
- [x] 11. 类型检查验证(runtime tsc 通过、cargo check 通过、识别器单测通过、dst.zip 端到端分析推断 dst/zhs 99%)

## 实施要点

### runtime

- 新文件 `src/lib/magic/image-import/zip.ts`:封装 zip.js —— `listZipEntries(path)`(仅 central directory)与 `readZipEntry(entry)`(流式提取 bytes);`decodeText` 策略:严格 UTF-8 解码失败则 GBK;在 Bun 下必须 `new zip.BlobReader(blob)` 包装。
- 新文件 `src/lib/magic/image-import/parse.ts`:纯函数识别器。stem 模式依序:编号-数字面(`-` 不作名称分隔符)→ 编号+分隔符(#/_/空格)+名称 → 纯编号(允许前导零与字母后缀)。`chooseNamingPattern(items)` 按 ≥95% 覆盖率选定;`numberCandidates(number)` 返回 `{原文, 数字部分去前导零}` 去重集。
- 上传组常量放 `src/lib/magic/image-import/common.ts`:`uploadImageSources = ['manual', 'mtgch', 'mtgflame']`。A/B 两任务 entry 的 `is distinct from 'manual'` 替换为 `not in 上传组`(经 `notInArray` 或等价 SQL)。
- 新文件 `src/lib/magic/task/manual-image-import/definition.ts`(替换 `manual-image-replace`):
  - 输入:`source(manual|mtgch|mtgflame|scryfall|gatherer)`、`set`、`lang`、`force`(默认 true)、上传单张(`number/faceIndex?/fileName?/dataBase64`)、上传 zip(`zipPath`)、下载组(`number`)。
  - 队列构建:上传 zip → 识别器解析条目 → 按编号候选集查 prints(set+lang)→ 匹配行(全部更新)、unmatched、unrecognized;上传单张 → 单条目;下载组 → 按 set+lang+number 精确查行,取 `scryfall_image_uris`/`multiverse_id`,faceIndex 由 `faceIndexOf` 推导。
  - 跳过规则(§3):force=false 仅 `image_source is null`;force=true 追加下载组来源行;上传组 force=true 追加上传组行;下载组永远跳过上传组行并计 `skippedUpload`。
  - 名称校验:zip 条目名称与匹配行 `print_name` 不一致记 warning(不做失败)。
  - 写入:encodeWebp → assessQuality → writeCanonical(**以 DB 行 number 为准**)→ 更新 image_* 字段与 `image_source=所选值`。
  - 输出:`processed/written/unchanged/failed/skipped/skippedUpload/unmatched/unrecognized/lowQuality` + `unrecognizedNames`/`unmatchedNumbers`/`warnings` 清单。
- `task-definitions.ts`:替换注册;删除 `manual-image-replace/definition.ts`。

### orpc(magic.ts)

- `analyzeManualImportZip`:入参 `{ zipPath }`;读条目名 → 识别器 → 推断。文件名信号:zip 文件名去扩展名与顶层目录名对 `sets` 表 code 匹配;命中率信号:`print_name IN (…)` 按 (set,lang) 分组粗筛排序,再以编号候选集联合验证。返回 `{ convention, entryCount, unrecognized, candidates: [{set, lang, rate}] }`。
- `manualImageImport`:入参见任务输入;`createAndRunTask` 模式同 A/B。
- 移除 `manualImageReplace`。

### 前端(app-console-desktop)

- 依赖:`@tauri-apps/plugin-dialog`;Rust:`tauri-plugin-dialog = "2"` + `lib.rs` 注册;capability `default.json` 增加 `dialog:default`。
- 页面 `/magic/image-import/manual` 改版:
  - 来源选择(5 项);force 复选框默认 true;
  - 上传组 zip:路径文本框 + 「浏览…」按钮(对话框返回路径即填入,填入后触发分析;分析自动填 set/lang,用户可改;任务创建后表单冻结);
  - 上传组单张:编号/面序号 + 文件选择(base64);
  - 下载组:编号输入,隐藏文件选择与 faceIndex(faceIndex 由 scryfall_face 推导);
  - 分析结果区:约定、条目数、未识别清单、set/lang 候选(点击选用);
  - 文案用产品语言,不暴露内部概念。
- 对话框在非 Tauri 环境(浏览器 dev)不可用时 catch 并提示手输路径。
