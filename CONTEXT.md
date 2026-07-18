# Context

## Hearthstone Announcement (炉石公告)

### Announcement Item (公告条目)
A single change entry inside an announcement. Entity references are mutually exclusive by type: `card_change`/`card_update` use `cardId` (+ `relatedCards`), `set_change` uses `setId`, `rule_change` uses `ruleId`, `format_birth`/`format_death` use none.

### lastVersion (对比版本)
The comparison version (buildNumber) of an announcement or item, informally called "prevVersion". Defaults to `version` when empty. Item-level values override announcement-level values.

### group (分组)
A finite display-grouping key on card_change items belonging to a bulk rotation. Allowed values are fixed by the hearthstone model enum (`core_rotation`, `bg_rotation`). Same-group items in the same place collapse/expand together on the site to save space.

### delta
A per-side display correction on a card-level item: `{ prev?: Partial<RenderModel>, curr?: Partial<RenderModel> }`. Each side is merged onto the resolved render model of the corresponding image before rendering. Display-only; never a data patch.

### glow
Part-level highlight markers on an item: `{ part, type: 'buff' | 'nerf' }[]`. An optional field on renderModel. When present, affects renderHash. curr images carry glow; prev/base images have no glow — their renderHash equals the existing `entity_localizations.renderHash`, enabling natural deduplication.

### prev image / curr image (前图 / 后图)
The two rendered images of a `card_update` item: prev = the card at `lastVersion`, curr = the card at `version` with glow applied.

### base image (base 图)
The single rendered image of a `card_change` item (the card at the item's version, no glow). Rendered on demand because the asset may not exist yet.

### item rendering (条目渲染)
Rendering happens in the console editor (desktop runtime + local renderer); the public site only displays already-generated images. Each side resolves strictly from the imported entity revision at that side's version; a missing revision is an error (no cross-side fallback, no synthesis).

### render hash for announcement items (公告条目渲染哈希)
A single formula: `SHA256(canonicalize(renderModel))`. renderModel incorporates glow when the item carries it (curr side). When glow is absent (prev / base sides), the renderModel is identical to the entity's stored renderModel → the hash equals `entity_localizations.renderHash`, enabling natural deduplication with existing card images. The hash is computed on the fly by both the editor (rendering) and the site (URL construction) via a shared utility; no pre-stored column is needed.

### rendering parameters (渲染参数)
zone = `hand`, premium = `normal` (fixed). template = `battlegrounds` when the item's format is `battlegrounds`, otherwise `normal`. category = `glow` when the renderModel includes glow (curr side), otherwise `base` (prev / base sides). The editor provides a language selector; selecting a specific language renders only that language, while "all languages" renders all supported locales. The selector value persists in localStorage across page switches.

## Task System (任务系统)

### Task Definition
Definition of a task type, defining its lifecycle hooks weakly typed (current) or strongly typed (target). Being migrated to a generic definition with explicit per-task type parameters. Uses a builder API: `createDefinition().input(zod).output(zod).scope({...}).context({...}).stage(...)`.

### Task Input
The task-level input declared via a Zod schema. Type `TInput`. Passed into the first stage's `entry` as `input` and into `context.init()`.

### Task Output
The task-level output declared via a Zod schema. Type `TOutput`. Stored in the `task_runs.result` JSONB column. The last stage's `run` (simple) or `exit` (chunked) return type must match the output schema.

### Task Scope
A separate declaration from input. Contains a literal `type` and a `resolve` function that extracts `{ key, snapshot }` from the task input. Used for single-slot enforcement per `(taskType, scopeType, scopeKey)`.

### Task Ctx
A context object that lives for the entire task run. Initialized in `context.init()` when the task is created. Accessible by all stage hooks. Must only contain data that does NOT depend on stage ordering — resources (db connections), immutable flags, and resolved configuration. Stage-to-stage data must flow through the exit/input chain, not through ctx mutation.

### Stage
A step in the task execution pipeline. Two kinds:
- **Simple stage**: Has a `handler` hook that executes atomically. Input from previous stage's output. Returns output for next stage.
- **Chunked stage**: Has `entry` (prepare, determines total), `block` (called per block), `exit` (finalize, returns output for next stage). Framework checks pause/cancel between `block` calls. Each `block` receives the previous `block`'s return value as `blockInput`.

### Stage I/O
Each stage receives the previous stage's output as its `input`. The first stage receives the task-level `input` as its `input`. The last stage's `handler`/`exit` return type must match the task-level `output` schema.

### Block Input
Data passed between consecutive `block` calls within a chunked stage. The first `block` receives the `blockInput` returned by `entry`. Each subsequent `block` receives the previous `block`'s return value. Terminated by `{ done: true }`.

### Block Progress
Reported via a `progress` callback within `block` hooks. Type varies by the stage's `progressMode`:
- `bounded`: `{ done: number; total: number; segments?: [...] }`
- `unbound`: `{ done: number }`
- `simple`: no arguments

## User Configuration (用户配置)

### lang
The UI display language, controlling the interface text locale (i18n). A cross-game setting stored in the global config.

### locale
The game data language preference, controlling card images, avatars, search result ranking. Per-game setting stored in each game's config.

### global config (全局配置)
Cross-game user configuration identified by `game_id = 'global'`. Contains `lang`, `gameLocales` (a map of each game's locale), and other cross-game preferences. Stored in `public.user_configs` and synced to a cross-domain cookie for SSR hydration and cross-site access.

### game config (游戏配置)
Per-game user configuration identified by the game schema name (e.g., `hearthstone`, `magic`). Contains game-specific preferences like `locale`, search layout, and display options. Stored in `public.user_configs` and synced to localStorage for per-origin access.

### anonymous UUID (匿名标识)
A UUID generated on first visit and stored in a cross-domain cookie. Used to associate local config state with an anonymous identity before login. Enables config migration from anonymous to authenticated state.

### config merge (配置合并)
The conflict resolution strategy for syncing: per-key merge with remote winning on conflicting keys (Chrome/Edge model). The inheritance chain for reading is: game config > global config > Zod `.default()`.

### config sync lifecycle (配置同步生命周期)
1. App load: read localStorage (game) + cookie (global), Zod-parse with defaults
2. Login: fetch remote → merge (remote wins on conflict) → write localStorage + cookie → push back (to upload anonymous-only keys)
3. Post-login change: immediate local write → debounced remote push → mark unsynced on failure
4. Page reload (authenticated): localStorage is stale cache, re-fetch remote → merge → update localStorage
5. Logout: stop sync, keep localStorage, operate as anonymous
