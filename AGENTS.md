# Code Style

This file must always be written in English.

## Comments

All code comments must be written in English. When editing files, translate any non-English comments to English.

## Frontend Code

Prefer the nullish coalescing operator (`??`) over the logical OR operator (`||`) for default values in frontend code.

## Naming

Within a local file scope, do not use overly complex naming. Prefer clear and simple names for local variables, local types, and helper functions.

Exported names do not need to be globally unique. Keep exported names as short as reasonably possible.

If a short exported name is ambiguous at the usage site, resolve the ambiguity with an import alias at the usage site.

Zod schema exports must not end with `schema`. Exported zod schemas and their inferred types should differ only by capitalization, for example `card` and `Card`.

## Delivery Workflow

When a new requirement is given, first create a design proposal and place it in the `docs/` folder.

After that, evaluate the proposal. Only after the evaluation passes, create an implementation plan in the `plans/` folder.

Each plan must include a todo list at the beginning of the same file. The todo list must be derived from the plan.

During implementation, follow the todo list and the plan strictly.

Mark each todo item as completed immediately after finishing it.

All content created in the `docs/` and `plans/` folders must be written in Simplified Chinese.

If a design document or plan file is created by the agent as part of executing a task, the agent should delete it after the task is completed.

If a design document or plan file was created by the user, the agent must not delete it.

## Commit Messages

Use Conventional Commits for all commit messages.

Keep commit messages short and focused on the implemented feature or fixed issue, not on the specific implementation or fix method, unless explicitly requested.

Keep commit messages to a single line unless explicitly requested otherwise.

Do not create commits directly. Always show the proposed commit message to the user first, wait for explicit confirmation, and only then create the commit.

Use the most specific reasonable scope when writing commit messages. Follow the repository's existing style and prefer fine-grained scopes such as `console/magic`, `db/magic`, `watcher/magic`, `hearthstone`, `ui`, or `sync` instead of broad generic scopes when applicable.

Examples based on existing repository history:

- `feat(console/magic): add view page`
- `feat(db/magic): add rule schema`
- `feat(watcher/magic): update logic of rule`
- `feat(hearthstone): add card page`
- `fix(sync): cannot sync with tag`
- `refactor(ui): update useTitle`
