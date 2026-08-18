# Context

## Single-Card Projection Tests (单卡投影测试)

### single-card test (单卡测试)
A fully offline, self-contained `bun:test` file under `apps/service-desktop-runtime/src/lib/hearthstone/task/project/cards/`. Each file fixtures one card at one build: the input snapshot (card, tags, tag config, context) and the expected projected result (entity, localizations, relations with hashes) are both baked into the file. Running it replays the projection with no database.

### generate-card-test (单卡测试生成)
The CLI at `apps/service-desktop-runtime/scripts/generate-card-test.ts`. It reads one card at one build from the local database, runs the pure projection, writes a `cards/<name>.test.ts` fixture, and runs eslint --fix on it. Usage: `DESKTOP_LOCAL_DATABASE_URL=... bun run apps/service-desktop-runtime/scripts/generate-card-test.ts --card CS2_029 --build 240397 --name fireball-spell-school [--tables entity,localizations,relations]`. Regenerate whenever a projection behavior change should be pinned by a test.

### card projection pure entry (投影纯函数入口)
`projectExtractedCard` (exported from `task/project/project.ts`) maps a card snapshot + tags + tag config + context to a complete `ProjectCardResult`. Both the generator script and `cards/runner.ts` call it directly, so generated fixtures stay valid offline as long as the pure projection is unchanged.

## Hearthstone Announcement (炉石公告)

### Announcement Item (公告条目)
A single change entry inside an announcement. Entity references are mutually exclusive by type: `card_change`/`card_update` use `cardId` (+ `relatedCards`), `set_change` uses `setId`, `rule_change` uses `ruleId`, `format_birth`/`format_death` use none.

### projection (投影结果)
A jsonb column on an announcement item holding the derived display projection so the site can find which items affect a card or format. Current minimum shape: `{ formats: string[], cards: string[] }` — `formats` = the keyword-expanded single-format list; `cards` = the flat set of affected card IDs (direct `cardId` + `relatedCards`, plus set→cards fan-out for `set_change`). The shape is open so future richer projections (e.g. per-card status) can add keys without a migration. The item's own `status` applies uniformly to every fan-out card; status is never stored per card. Divergent per-card outcomes are never expressed inside one item — they are authored as separate items. The site queries it via jsonb containment (`projection->'formats' @> ...`, `projection->'cards' @> ...`) on expression GIN indexes.

### projection step (投影)
The derivation that fills an item's `projection` column from its authored fields (format keyword expansion + cardId/relatedCards + set→cards). Runs from the announcement editor page. `format_birth`/`format_death` produce no card fan-out; `rule_change` fan-out depends on whether the rule points at a card attribute.

### lastVersion (对比版本)
The comparison version (buildNumber) of an announcement or item, informally called "prevVersion". Defaults to `version` when empty. Item-level values override announcement-level values.

### group (分组)
A finite display-grouping key on card-level items that belong to a coordinated batch, typically a bulk rotation or a battlegrounds card-type refresh. Allowed values are fixed by the hearthstone model enum: `core_rotation`, `bg_hero`, `bg_minion`, `bg_trinket`, `bg_tavern_spell`, `bg_anomaly`. Same-group items in the same place collapse/expand together on the site to save space.

### update entity (更新实体)
The site's display grouping of card-level items. The entity card of a group is the `relatedCards` entry when an item has related cards, otherwise the item's own `cardId`. An item whose `cardId` carries `relatedCards` is demoted to a parent — it does not become an entity itself, its update is embedded under each related card (an item with multiple related cards is embedded under each). An entity aggregates every item where it is the `cardId` (its own update, rendered without the parent id) or a related card (the parent's update, rendered with the parent id). The entity's displayed status is its own item's status, or a combined status computed from the contributing items (single distinct status wins; multiple significant statuses → `rework` if present else `tweak`; multiple non-significant statuses → `tweak`).

### delta
A per-side display correction on a card-level item: `{ prev?: Partial<RenderModel>, curr?: Partial<RenderModel> }`. Each side is merged onto the resolved render model of the corresponding image before rendering. Display-only; never a data patch.

### glow
Part-level highlight markers on an item: `{ part, type: 'buff' | 'nerf' | 'rework' | 'neutral' }[]`. `rework` marks a functional redesign that is not directionally stronger or weaker; `neutral` marks a presentation or wording change without gameplay impact. An optional field on renderModel. When present, affects renderHash. curr images carry glow; prev/base images have no glow — their renderHash equals the existing `entity_localizations.renderHash`, enabling natural deduplication.

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

## Hearthstone Card Image Cleanup (炉石卡图清理)

### related image (相关图片)
When cleaning soft-deleted rows, whether a card image is "related" is decided by the `renderHash` of the cleared `entity_localizations` rows — not by `cardId`. Images live as bucket files keyed by `renderHash`; the `card_image_assets` rows are only secondary consistency metadata.

### orphaned image (孤立图片)
An image asset whose `renderHash` is no longer referenced by any live (non-soft-deleted) `entity_localizations` row. Cleanup deletes only orphaned images: the orphaned set is `{renderHash of cleared rows} − {renderHash still referenced by live rows}`. Deleting a still-referenced `renderHash` would break surviving rows that share identical card content.

### purge (清除软删除行)
The manual cleanup operation that hard-deletes all soft-deleted rows from the local `entities` / `entity_localizations` / `entity_relations` tables. Runs as the `hearthstone_purge` task; when the image bucket is configured it also deletes the orphaned images of those rows, in the order files first, then tables. The bucket files are the primary object; `card_image_assets` rows are only secondary consistency metadata. Announcements are not protected — deleted images are deterministically re-rendered on demand.

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

## API Service & Docs Site (API 服务与文档站)

### API Service (API 服务)
The public data API (`apps/service-api`), reachable at `api.tcg.cards`. A pure machine-facing, read-only REST API for external third-party consumers. Every business request requires an API Key (`Authorization: Bearer <key>`); there is no anonymous access and no session channel in the service. Routes are versioned under `/api/v1/...` with no unversioned alias and no redirects. The OpenAPI spec at `/openapi.json` is derived from the game-module registry.

### game module (游戏模块)
A per-game oRPC router (a set of procedures carrying `.route()`/`.input()`/`.output()` metadata and API-side handler queries), living in a per-game folder of the shared `packages/api` package. It is the single source of truth shared by `service-api` (aggregate + mount → serve) and `site-docs` (introspect → document). Query handlers are written per game inside the module and are not shared with the game sites. Adding a game = adding one module folder + registering it, with zero infrastructure changes.

### named enum (命名枚举)
An enum hoisted into a named schema type with a stable identity, so model docs and OpenAPI can reference it by name. Model doc keys take the form `{game}.model.{enum}.{value}`.

### model doc key (模型文档 key)
The vue-i18n message key for field/enum explanations: `{game}.model.{schema}.{field}`, `{game}.model.{enum}.$self`, and `{game}.model.{enum}.{value}`. Localized in `en`/`zhs` TS message files; a build-time script in `site-docs` diffs the expected key set (introspected from the registry) against the message files.

### docs test key (测试 key)
An API key auto-generated for a logged-in docs user on first test click, named by convention (`docs-test`), surfaced and manageable/deletable in `/settings`. It covers all current games and lets the "Try it" panel work without manual key entry while keeping the mandatory-key model intact.
