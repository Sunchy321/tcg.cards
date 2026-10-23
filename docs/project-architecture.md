# Project Architecture

## Purpose

This document defines the high-level runtime and data ownership model of the project.

It is intentionally architecture-first instead of implementation-first. Specific modules may still be in transition, but new work should follow the boundaries described here.

## Runtime Shapes

The workspace mainly uses three runtime shapes for client-facing or interface-facing applications:

- `site-*`
  Website deployments for end users.
- `app-*`
  Installable applications, currently including the desktop app.
- `service-*`
  Backend API or control-plane services exposed to other runtimes.

Each runtime shape may expose different capabilities, but they must not blur data ownership.

New application names under `apps/` should follow these prefixes when they fit one of these primary runtime shapes. Special-purpose operational runtimes may keep descriptive names when they are primarily scheduled job runners instead of backend interfaces.

## Applications

The `apps/` workspace currently contains these project-level applications:

- `app-console-desktop`
  Desktop admin console and the primary local runtime for heavy domain-data workflows. This app owns the most complete local operational capability, including access to local repositories, local PostgreSQL, and desktop-only workflows.
- `app-console-mobile` (planned)
  Lightweight mobile management client. It is intended to cover a management tier similar to `site-console`, but run on mobile devices instead of the web. It may also support selected lightweight management capabilities that are not practical in a browser.
- `app-desktop` (planned)
  User-facing installable desktop app (Windows/macOS), built on Electron. It shares its business code with `app-mobile` and is a query client for end users, not a management runtime.
- `app-mobile` (planned)
  User-facing installable mobile app (iOS/Android), built on Capacitor. It shares its business code with `app-desktop` and is a query client for end users, not a management runtime.
- `service-app` (planned)
  Backend query service for the user-facing apps: anonymous public card queries over the same remote game data the game sites serve, plus first-party authenticated user state such as user config sync. It is distinct from `service-api` (third-party, key-authenticated) and `service-internal` (management clients).
- `service-internal`
  Backend API surface for app-shaped management clients. It provides the remote backend interface used by installable management applications.
- `site-console`
  Web-based admin console. It is a restricted remote management surface and should not be treated as the execution authority for heavy domain-data workflows or as a substitute for desktop-only local capabilities.
- `site-{game}`
  User-facing website for one game. Current instances include `site-hearthstone` and `site-magic`.
- `site-main`
  Main website and navigation entry point for the project.
- `watcher`
  Operational runtime for scheduled checks and notifications. It intentionally keeps a descriptive name because its primary role is scheduled monitoring and automation rather than serving as a backend API for websites or apps. It currently focuses on change detection and reminders, and may later include scheduled data update workflows.

## Management Runtime Relationship

The management-facing runtimes do not share the same authority level, but they may still reuse the same backend code layers.

- `site-console`
  Web-based remote management surface. It should stay within the restricted web capability tier and expose its lower-capability remote router in-process, because the website deployment should avoid cross-service requests for its own management traffic.
- `app-console-mobile` (planned)
  Mobile management client intended to sit above `site-console` and below desktop in overall capability. Its final exposed capability does not need to equal the full router currently hosted by `service-internal`.
- `service-internal`
  Remote backend API surface for app-shaped management clients. It reuses the same management backend code layers where appropriate, exposes a higher-capability remote router than `site-console`, and exists as a separate service because app-shaped clients cannot avoid remote service requests in the same way that `site-console` can.
- `app-console-desktop`
  Full management runtime. Its capability is not defined only by remote routers because it also owns desktop-local capabilities such as local repositories, local PostgreSQL, and full local data workflows. Some desktop operations may also read or write remote databases through direct connections instead of going through `service-internal`.

Capability should therefore be described at the runtime level, not only at the router level.

For remote router exposure, the current intended ordering is `site-console` < `service-internal`.

Desktop sits above that remote-router ordering because it also owns local-only capabilities and some direct remote-database operations that do not enter the remote router surface.

`service-internal` may host the full desktop-oriented router surface internally, but that does not imply every app-shaped client should receive every exposed capability.

## Packages

The `packages/` workspace contains shared building blocks used across multiple applications:

- `auth`
  Shared authentication integration, including console auth client creation, role helpers, and server-side auth setup.
- `console-api`
  Shared management API surface and related domain-side backend logic exposed to console clients.
- `console-core`
  Shared console-level primitives such as error handling and layout metadata.
- `console-platform`
  Platform abstraction layer for console clients, including API access, router integration, session handling, storage, toast integration, and capability interfaces.
- `console-shell`
  Shared Nuxt shell for management applications, including reusable admin pages, routing structure, and console-facing UI composition.
- `db`
  Database schema definitions, schema-source layout, and migration tooling for the local and remote deployment tracks plus their shared schema sources.
- `eslint-config-custom`
  Shared lint configuration used across the workspace.
- `model`
  Shared domain models, validation schemas, and typed contracts for game data and management APIs.
- `search`
  Shared search parsing, command modeling, translation, and execution helpers.
- `shared`
  Small cross-workspace shared constants and utility-level definitions.
- `tsconfig`
  Shared TypeScript configuration presets for the workspace.
- `ui`
  Shared UI layer and reusable Nuxt UI-based components or presentation modules.

## Data Ownership Dimensions

The database layout uses two independent dimensions.

The first dimension describes schema source and deployment track:

- `shared`
  Shared schema source for tables that are included in both local and remote tracks. It is not an independently deployed migration track.
- `local`
  Desktop-local deployment track for build state, import state, caches, and local processing metadata.
- `remote`
  Remote deployment track for service state, app-facing control-plane data, and deployment-specific records.

The second dimension describes the business namespace intent for each game:

- `{game}`
  Shared domain facts.
- `{game}_data`
  Import-side facts, build-side facts, and other system-side data that should not be treated as exportable shared domain data or user-facing app state.
- `{game}_app`
  User-facing application state.

Within this first dimension, only `local` and `remote` are deployment tracks. `shared` only describes where shared schema definitions live before they are included into those tracks.

These dimensions are orthogonal and must not be collapsed into one classification.

A schema track answers where a workflow is stored and migrated. A game namespace answers what kind of fact a table represents.

That means a local or remote track may include `{game}` and `{game}_data` tables. In normal cases, `{game}_app` belongs to remote application workflows rather than local desktop workflows, but any exception must be explicit and justified by the workflow.

When placing a table, decide both dimensions explicitly instead of assuming that one dimension implies the other.

## Authority Model

The desktop app is the execution authority for heavy domain-data workflows.

That means:

- desktop owns the most complete local runtime context
- desktop can access local repositories and local PostgreSQL
- desktop is allowed to run bulk import, heavy import, and other heavy domain-data workflows
- remote is not the default execution authority for heavy domain-data workflows

Remote runtimes are limited replicas, publication targets, or restricted management surfaces.

A remote workflow may own a subset of fields or records, but that ownership must be explicit. Remote must not be treated as universally authoritative just because it is centrally deployed.

Capability intent should be read in three layers:

- heavy domain-data workflows
  Desktop is the only intended execution surface for workflows that depend on local repositories, local PostgreSQL build state, bulk import, heavy import, or heavy projection.
- lightweight domain-data editing
  Web, mobile, and desktop management runtimes may all expose lightweight editing capability, subject to their intended remote-interface tier and runtime workflow constraints.
- non-domain management workflows
  Management features that do not define or transform domain data, such as user-management style workflows, are not desktop-exclusive by default and may be shared across management runtimes.

## Current Explicit Remote-Owned Scope

The current project-level remote-owned scope is intentionally limited to categories whose primary runtime context lives in remote infrastructure:

- remote auth, account, session, and API credential state used by remote-facing applications and management clients
- `{game}_app` state created through remote application workflows, including user-created content, user interaction state, and remote review decisions
- remote operational `{game}_data` that depends on hosted infrastructure rather than desktop-local build execution, such as knowledge indexing state, embedding state, hosted asset metadata, and similar remote processing records
- deployment-specific control-plane records that only exist to operate remote runtimes

These remote-owned categories may reference shared domain data or desktop-produced data, but they must not silently overwrite desktop-owned build truth, import truth, or local processing truth.

## Game Data Architecture

Desktop-local execution is the default target shape for game data workflows.

The intended steady-state shape is:

1. desktop reads and prepares local game source data
2. desktop writes build and import state into local PostgreSQL
3. desktop runs local processing
4. desktop synchronizes selected facts to remote when needed

This means the local database is the build authority for game data workflows.

Remote should not remain the primary execution surface for local build truth, local import truth, or local processing truth unless a specific workflow is explicitly designed otherwise.

## Local/Remote Sync Strategy

Local and remote are separate databases, so multi-end editing is fundamentally a synchronization and merge problem rather than a single-writer problem.

Each management runtime may perform edits within its allowed capability range.

In practice, desktop usually produces more domain-data changes because bulk import and heavy import run there.

When the same dataset may be edited from both sides, the workflow must define merge behavior explicitly, such as timestamp-based precedence, field-level ownership, or another deterministic policy.

The default design goal is to avoid treating generic full-row last-write-wins as an implicit global rule.

When one dataset mixes manually curated fields with build-generated or import-generated fields, the responsibilities should be separated instead of forcing one undifferentiated synchronization rule across the whole row.

## Sync Direction Principles

Synchronization must follow authority, not convenience.

Default rule for desktop-led domain-data workflows:

- desktop -> remote is the primary direction

Remote -> desktop is allowed only when all of the following are true:

- the remote-owned subset is explicitly defined
- the returned fields do not overwrite desktop-owned truth
- the sync behavior is explainable to users and developers

The system should avoid generic bidirectional full-row merges.

This default direction does not override explicitly remote-owned categories. When a workflow is defined as remote-owned, its sync behavior should follow that ownership definition instead of being forced back into a desktop-led pattern.

## Current Architectural Rule

When a game workflow depends on local repositories, local files, or local PostgreSQL build state, desktop should be treated as the execution authority unless there is a clear reason not to.

When a table mixes manually maintained fields with build-generated or import-generated fields, split the responsibilities instead of relying on ambiguous merge ownership.

## Series Display Choices and Publishing

Data-maintenance records belong in `{game}_data`, including manually maintained shared choices; manual editing alone does not make a record application-user state.

Magic series metadata and booster composition are built locally and published as static domain data. Each booster product occupies one row identified by series and booster code, with its complete pack and sheet composition stored as typed JSONB. Imports replace all booster products of a series atomically; publishing and read interfaces use that same complete structure. Shared series display choices are maintenance data in `magic_data`; imports preserve that authority and materialize the chosen values into the exportable series rows. Only those derived display values are published, alongside series names and complete booster composition. Remote sites do not read the local choice table, and the domain schema has no dependency on it.

## Static and User Content Serving

Within each game, static documents and decks are built in local `{game}` tables and explicitly published into remote `{game}_app` serving tables that also contain user-created content. Local contains no user data, user foreign keys, or user-operation records. Import configuration, execution state, and build metadata remain local `{game}_data`; public reads do not depend on those records. Common rendering does not introduce cross-game content storage.

The remote table namespace does not transfer ownership of static-origin rows to remote workflows. Explicit origin and stable publication identity delimit the publisher's write set; user-origin content and user operations remain remote-owned. The content contracts are shared, but physical local and remote schemas need not be identical. No second remote static content table is required. This serving pattern is specific to these content workflows, not a change to unrelated domain-table publication.

Documents distinguish saved revisions from public releases. Translations reference exact source revision nodes and follow the source release sequence. Node text is authoritative for full-text search; typed markers carry formatting and references, and game symbols remain literal text. The accepted target model and its implementation boundaries are recorded in [ADR-0018](adr/0018-documents-unify-remote-content-with-node-based-translations.md).

A manual CR reimport can repair parsing of the same retained source file directly in its public source revision, without adding an editing revision. The static publication path supports the same transactional node replacement. Existing translation or comparison dependencies block replacement, and the retained original bytes, revision identity and authored metadata remain unchanged.

Rule content statistics are derived revision metadata and travel through the same publication path as content. Metadata-only backfills do not replace immutable text or alter translation and comparison references. Each language's statistics describe its own saved text. service-api reads published rule identities, releases, and metadata from the remote serving tables, without depending on local import state or source files on the desktop.

Published original-file descriptors contain R2 object keys and byte integrity information, not deployment-specific download URLs. Sites and service-api resolve each key against their own asset base URL at read time. The existing asset store owns file delivery; document publication carries descriptors without uploading or rewriting the original bytes. Source URLs describe provenance separately from the download addresses generated by each application.

Adjacent formal document relations are derived data: static-source preparation is owned by local `magic_data`, while remote `magic_app` owns relations used with its serving documents and user articles. Preparation is an explicit management action, separate from import, publication, and reader requests. Item history validates the formal publication sequence, source content/structure fingerprints, and matching algorithm version before selecting related nodes. Unprepared or outdated relations fail the dependent history read; ordinary reading and publication impose no relation-readiness gate. These derived relations are separate from retained comparison and review evidence.

## Documentation Rule

Architecture documents under `docs/` describe stable boundaries and authority rules.

Requirement-specific design work lives in the issue tracker under `.scratch/`, which is git-ignored. The decisions that outlive it live in `CONTEXT.md` and `docs/adr/`.
