# Code Style

This file must always be written in English.

## Comments

All code comments must be written in English. When editing files, translate any non-English comments to English.

## Frontend Code

Prefer the nullish coalescing operator (`??`) over the logical OR operator (`||`) for default values in frontend code.

Only use the logical OR operator (`||`) for frontend fallback behavior when boolean coercion is explicitly intended.

## Naming

Within a local file scope, do not use overly complex naming. Prefer clear and simple names for local variables, local types, and helper functions.

Exported names do not need to be globally unique. Keep exported names as short as reasonably possible.

If a short exported name is ambiguous at the usage site, resolve the ambiguity with an import alias at the usage site.

Zod schema exports must not end with `schema`. Exported zod schemas and their inferred types should differ only by capitalization, for example `card` and `Card`.

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

After the related implementation is completed and the spec is no longer active, move the finalized spec package to `archive/`.

Temporary proposals that are only used to reason through a small or discarded idea should be deleted when finished. Do not move temporary proposals to `archive/`.

Do not leave finalized design artifacts split across `proposals/`, `reviews/`, `plans/`, and `docs/`. Consolidate finalized design, review, and plan artifacts under the relevant `specs/<requirement>/` folder.

Each plan must include a todo list at the beginning of the same file. The todo list must be derived from the plan.

During implementation, follow the todo list and the plan strictly.

Mark each todo item as completed immediately after finishing it.

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

Do not hand-edit Drizzle migration snapshots, indexes, constraints, table definitions, or other schema-derived SQL when `drizzle-kit generate` can produce them.

Only add manual SQL for migration behavior Drizzle cannot infer, such as deterministic backfills, data cleanup, transitional compatibility steps, or extension setup. Keep manual SQL minimal and place it alongside the generated migration it supports.

## Commit Messages

Use Conventional Commits for all commit messages.

Keep commit messages short and focused on the implemented feature or fixed issue, not on the specific implementation or fix method, unless explicitly requested.

Keep commit messages to a single line unless explicitly requested otherwise.

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
