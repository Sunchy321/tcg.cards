# desktop 游戏设置与本地 repo 配置设计

> 稳定的运行时边界、数据归属和同步规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只描述 desktop 本地配置需求的增量设计；若有冲突，以主架构文档为准。

## 背景

当前 desktop 端把 hsdata 本地仓库路径单独存放在 `hsdata-settings.json` 中，结构只有一个 `repoPath` 字段。

这套实现只适合“单功能、单仓库”的场景，但 desktop 后续很可能还会接入更多本地 git repo。继续沿用“每个功能一个独立 settings 文件、每个文件只存一个路径”的方式，会带来几个问题：

- 配置文件会按功能不断分裂，难以查看与迁移
- 单字段结构无法表达多个 repo 的管理需求
- 前端页面和 Tauri 命令被绑定到“只有一个当前 repo”的假设上
- 后续如果要支持 repo 切换、命名、删除或迁移，会反复修改底层存储结构

因此需要把当前 hsdata 的单仓库配置，提升为 desktop 端统一的游戏设置配置，并放到独立设置界面中管理。

## 目标

- 将 `hsdata-settings.json` 替换为 desktop 统一配置文件
- 将本地 repo 配置统一收敛到独立设置界面，而不是散落在功能页中
- 设置界面左侧按游戏切换，右侧展示对应游戏的具体配置项
- 为后续其他游戏的本地配置项提供一致的信息架构

## 非目标

- 本轮不实现多个 repo 同时参与导入
- 不改变 hsdata 导入与投影的远端接口语义
- 不把 desktop 变成自动 clone 或管理 git 仓库的工具
- 不在本轮设计中引入数据库或系统级配置中心
- 不兼容旧的 `hsdata-settings.json` 单仓库配置

## 现状问题

### 1. 配置粒度过细

当前 `hsdata-settings.json` 只服务于 hsdata，一旦 desktop 未来接入其他本地 repo，将继续新增独立文件，配置会分散到多个位置。

### 2. 数据模型无法扩展

当前持久化结构为：

```json
{
  "repoPath": "/path/to/hsdata"
}
```

这个结构无法承载：

- 按游戏组织的设置结构
- 每个游戏下多个具体配置项
- 后续配置扩展元信息

### 3. 页面与命令强绑定单路径

desktop 的数据源页和导入页当前都直接围绕 `repoPath` 工作，Tauri 侧也只暴露 `get/set repo path` 这一组接口。后续一旦要扩展到多游戏或更多本地配置项，就必须同时改动前端和命令边界。

### 4. 配置入口放在功能页中不利于扩展

hsdata 仓库路径当前放在数据源页里配置，这会让“业务操作页”和“应用设置页”的职责混在一起。随着 desktop 增加更多游戏和更多本地配置项，继续把配置入口留在各个功能页里，会让信息架构越来越分散。

## 设计决策

### 1. 使用统一的 desktop 配置文件

将当前独立的 `hsdata-settings.json` 替换为统一配置文件，例如：

- `desktop-config.json`

文件仍放在 Tauri 的 `app_data_dir()` 下，由 desktop 本地负责读写。

### 2. 统一配置文件采用“按游戏组织设置项”结构

建议结构如下：

```json
{
  "version": 1,
  "games": {
    "hearthstone": {
      "hsdata": {
        "repoPath": "/absolute/path/to/repo"
      }
    }
  }
}
```

其中：

- `version` 用于后续结构升级
- `games` 是按游戏组织的设置集合
- `hearthstone` 是游戏键，对应炉石相关的本地配置项
- `hsdata.repoPath` 是炉石 hsdata 仓库路径配置
- 如果某个游戏尚未配置任何项，对应键可以缺省

### 3. 设置界面使用“左侧游戏导航，右侧配置内容”布局

desktop 使用独立的设置界面承载本地配置，入口保留在现有 `/settings` 页面。

页面布局为：

- 左侧边栏：游戏列表，例如 `Hearthstone`、`Magic`
- 右侧内容区：当前游戏的设置分组和具体配置项

在 `Hearthstone` 设置区中，`hsdata repo` 是一个具体配置项，而不是独立页面。

这样做的原因是：

- 符合“先选游戏，再看该游戏配置”的信息架构
- 后续增加其他炉石配置项时，可以继续放在同一个游戏分组下
- 后续增加其他游戏时，不需要再复制一套新的设置页结构

### 4. hsdata 仍保持单仓库语义

虽然统一配置文件按游戏保存多项设置，但 hsdata 的具体导入流程仍只读取 `games.hearthstone.hsdata.repoPath`：

- `hsdata_get_repo_state`
- `hsdata_list_sources`
- `hsdata_read_source`

这组现有业务命令可以继续保留“读取 hsdata 当前配置仓库”的含义，避免导入页被迫改造成多 repo 选择模式。

### 5. 新增通用设置命令，替代单路径命令

当前的：

- `hsdata_get_repo_path`
- `hsdata_set_repo_path`

应被更通用的配置接口替代，例如：

- `desktop_get_settings()`
- `desktop_get_game_settings(game)`
- `desktop_set_game_repo(game, repoKey, path | null)`

其中炉石相关页面只消费 `game = hearthstone` 且 `repoKey = hsdata` 这一项配置。

### 6. hsdata 数据源页不再承担配置职责

hsdata 数据源页不再负责输入或清空仓库路径，而是只负责展示和操作当前已配置仓库的数据：

- 当前仓库区：展示当前已配置仓库的状态
- 来源列表区：展示当前仓库下可导入的来源
- 导航入口：提供跳转到设置页的按钮

导入页继续只使用当前已配置的 hsdata 仓库，不需要支持同一类型下的多 repo 选择。

### 7. 直接切换到新配置文件

本轮不提供旧配置迁移逻辑。

desktop 只读取和写入新的 `desktop-config.json`。原有的 `hsdata-settings.json` 不再作为兼容输入来源。

这意味着已经存在的旧配置不会被自动带入新结构，需要在新版页面中重新录入需要保留的 repo。

## 数据约束

- `games.hearthstone.hsdata.repoPath` 保存前必须解析为 git 仓库根目录
- `games.hearthstone.hsdata.repoPath` 对应目录下必须存在 `CardDefs.xml`
- 每个游戏下的每个 repo 配置项都只允许保存一个路径值
- 清空某个配置项时，应直接移除对应键或将其置空
- 未来新增配置项时，应优先放入对应游戏分组，而不是继续散落到单独文件

## 风险与取舍

### 1. 命令层会从“单值接口”变成“按游戏读取设置的通用接口”

这会引入一个 `game` 维度和更统一的设置读取方式，但它比继续让每个功能页各自维护独立配置更容易扩展，也更贴合设置界面的信息架构。

### 2. 数据源页需要让出配置入口

一旦 repo 配置迁移到设置页，数据源页上的路径输入区就应该移除，改成“查看当前状态 + 前往设置”。这会带来一轮页面文案和导航调整。

### 3. 旧配置会失效

由于明确不做兼容迁移，已经保存在旧 `hsdata-settings.json` 中的路径不会自动进入新配置。这个取舍换来的是更简单的底层实现和更直接的配置模型切换。

### 4. 本轮不做自动 clone

综合配置文件只负责记录和选择 repo，不负责自动下载或更新 repo。这样可以保持 desktop 本地能力边界清晰。

## 验收标准

- desktop 不再单独维护 `hsdata-settings.json` 作为长期主配置
- desktop 存在统一配置文件按游戏承载配置项
- `/settings` 页面存在左侧游戏导航和右侧配置内容区
- `Hearthstone` 设置中可以配置 hsdata 本地仓库路径
- hsdata 数据源页不再直接承担仓库配置输入
- hsdata 导入和来源浏览都基于当前已配置的 hsdata repo 工作
- 现有 hsdata 导入与投影流程不需要修改远端 worker-safe 接口
