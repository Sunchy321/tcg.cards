**NEVER make design decisions on your own. Always ask the user before deciding.**

**All modules use hot reload. Do not worry about stale code not being picked up.**

**NEVER revert design decisions previously made without the user's explicit request.**

## Code Style

For code style (comments, frontend code, naming), see [docs/code-style.md](./docs/code-style.md).

## Architecture Docs

Use `docs/project-architecture.md` and `docs/project-architecture.zh-CN.md` as the stable reference for project-level runtime boundaries, data ownership, and workspace responsibilities.

When a new requirement changes those stable boundaries, update the architecture docs in both languages together.

Keep project-level architecture in `docs/`. Keep requirement-specific design work in `proposals/`, `specs/`, and `archive/`.

## Delivery Workflow

When a non-simple requirement is given, first create a design proposal under the `proposals/` folder.

Simple requirements do not need a proposal, review, or implementation plan. Complete them directly.

A requirement is simple when it only involves one focused change and does not introduce new architecture, cross-module refactoring, data migration, or ambiguous technical decisions.

Examples of simple requirements include small documentation updates, minor text changes, localized refactors, and small configuration adjustments.

For non-simple requirements, keep the active design work in `proposals/` until the design is reviewed and approved.

After a proposal is reviewed and the design direction is accepted, move the finalized design package to `specs/`.

The `specs/` folder contains approved designs that are ready to guide implementation. A spec package may include the finalized design, review, implementation plan, and any supporting notes.

Within a proposal or spec package, use these standard filenames:

- `design.md` for the design document
- `review.md` for the design review
- `plan.md` for the implementation plan

When moving a completed spec package into `archive/`, keep the original `design.md`, `review.md`, and `plan.md` files and also add a `summary.md`.

The `summary.md` file must be the primary entry point for future lookup. It should tell readers to check `summary.md` first and only open `design.md`, `review.md`, or `plan.md` when they need detailed design reasoning, review history, or implementation history.

After the related implementation is completed and the spec is no longer active, move the finalized spec package to `archive/`.

Temporary proposals that are only used to reason through a small or discarded idea should be deleted when finished. Do not move temporary proposals to `archive/`.

Do not leave finalized design artifacts split across `proposals/`, `reviews/`, `plans/`, and `docs/`. Consolidate finalized design, review, and plan artifacts under the relevant `specs/<requirement>/` folder.

Each plan must include a todo list at the beginning of the same file. The todo list must be derived from the plan.

During implementation, follow the todo list and the plan strictly.

Mark each todo item as completed immediately after finishing it.

After a feature is completed, do not run linting unless the user explicitly asks for it.

If the user explicitly asks for step-by-step execution, implement only one planned step per turn, then pause and wait for the user's next instruction before continuing.

All content created in the `proposals/`, `specs/`, and `archive/` folders must be written in Simplified Chinese.

If a temporary proposal file is created by the agent as part of reasoning through a task and is not promoted to `specs/`, delete it after the task is completed.

If a design document, review file, plan file, proposal, spec, or archive file was created by the user, the agent must not delete it.

When adding a new database table, first classify it as `{game}`, `{game}_data`, or `{game}_app` before implementation.

Use this checklist for classification:

- `{game}` for exportable static domain data that can be used independently and should remain suitable for future full static export
- `{game}_data` for import-related and user-independent tables, including external source data, import state, import configuration, intermediate import cache, and other system-side import projections that do not carry user semantics
- `{game}_app` for any table that involves users, including user-created data, user behavior data, user settings, review actions, or any other application state tied to users; all user-related tables must go here

After classification, enforce schema dependency direction strictly:

- `{game}` must not depend on `{game}_data` tables
- `{game}` must not depend on `{game}_app` tables
- `{game}_data` must not depend on `{game}_app` tables
- `{game}_data` may depend on `{game}` tables when import-side linkage is needed
- `{game}_app` may depend on `{game}` and `{game}_data` tables when application features need them

If a table appears to mix multiple responsibilities, split the table first instead of placing it in an ambiguous schema.

## Database Migrations

For Drizzle-managed schema changes, update the schema definitions first and use `drizzle-kit generate` to produce migration SQL and snapshots.

**Do not generate migrations until commit time.** Make all schema changes first, then generate the migration as one of the final steps before committing.

For each commit, generate at most one migration per migration configuration.

When a migration must be regenerated for the current uncommitted work, delete the existing uncommitted migration for that configuration first, then rerun the generation script. Prefer the repository migration script over ad hoc commands whenever a script exists.

Do not hand-edit Drizzle migration snapshots, indexes, constraints, table definitions, or other schema-derived SQL when `drizzle-kit generate` can produce them.

Only add manual SQL for migration behavior Drizzle cannot infer, such as deterministic backfills, data cleanup, transitional compatibility steps, or extension setup. Keep manual SQL minimal and place it alongside the generated migration it supports.

If part of the migration cannot be generated by the script, such as triggers, generate the migration first and then apply the minimal manual SQL edits on top of the generated result.

## Soft Delete

**Some tables use soft delete via a `deleted_at` column.** Deletion operations must use `UPDATE SET deleted_at = NOW()` instead of `DELETE`. The Drizzle views (`active_*`) automatically filter out soft-deleted rows for all read paths.

- **Default:** Always soft-delete. Do not hard-delete rows from tables with a `deleted_at` column.
- **Hard delete exception:** When a hard delete is truly necessary, add an explicit comment explaining why soft delete is insufficient in that specific case.
- **Write paths:** Use `BaseEntity` / `BaseEntityLocalization` / `BaseEntityRelation` / `BaseCard` for Drizzle INSERT/UPDATE operations, as the view re-exports (`Entity`, `EntityLocalization`, etc.) are read-only Drizzle views.

## Commit Messages

Use Conventional Commits for all commit messages.

`fix` commits must describe the problem that was solved, not how it was fixed. State what was broken and why it mattered.

Keep commit messages to a single line. Only include body text when explicitly requested.

Do not create commits directly. Always show the proposed commit message to the user first, wait for explicit confirmation, and only then create the commit.

Use the most specific reasonable scope when writing commit messages. Follow the repository's existing style and prefer fine-grained scopes such as `console/magic`, `db/magic`, `watcher/magic`, `hearthstone`, `ui`, or `sync` instead of broad generic scopes when applicable.

Do not include technical workspace or package prefixes in the scope. For example, changes under `site-magic` should use `magic` or `magic/xxx`, not `site-magic` or `site-magic/xxx`.

Examples based on existing repository history:

- `feat(console/magic): add view page`
- `feat(db/magic): add rule schema`
- `feat(watcher/magic): update logic of rule`
- `feat(hearthstone): add card page`
- `fix(sync): cannot sync with tag`
- `refactor(ui): update useTitle`
