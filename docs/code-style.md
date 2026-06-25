# Code Style

## Comments

All code comments must be written in English. When editing files, translate any non-English comments to English.

When code is not obvious at a glance, add comments that explain the local reasoning, invariants, edge cases, or cross-step dependencies that a reader would otherwise have to recover from design documents, specs, or historical context.

Do not rely on proposals, specs, reviews, plans, PR descriptions, or commit history as the only place where non-obvious implementation intent is explained. The relevant code should remain understandable in place.

Keep these comments focused and high-signal. Explain why the code is shaped this way or what must remain true, not line-by-line mechanics that are already obvious from the code itself.

All function and type declarations must include a short English comment that describes their purpose. This applies to exported and local declarations alike.

For function and type comments, describe the behavior or role directly. Do not use meta phrasing such as "This helper...", "This function...", "This interface...", or "This type...".

Do not write comments in forms such as "This is used for..." or "Used to...". State the behavior directly instead.

## Frontend Code

Prefer the nullish coalescing operator (`??`) over the logical OR operator (`||`) for default values in frontend code.

Only use the logical OR operator (`||`) for frontend fallback behavior when boolean coercion is explicitly intended.

Avoid cross-package relative paths in frontend code. Prefer `node_modules`-based imports and package exports whenever possible.

**In frontend UI text, do not mention specific deployment details or internal design and implementation plans. Keep user-facing copy focused on product behavior and functionality.**

## Naming

Within a local file scope, do not use overly complex naming. Prefer clear and simple names for local variables, local types, and helper functions.

Exported names do not need to be globally unique. Keep exported names as short as reasonably possible.

If a short exported name is ambiguous at the usage site, resolve the ambiguity with an import alias at the usage site.

Zod schema exports must not end with `schema`. Exported zod schemas and their inferred types should differ only by capitalization, for example `card` and `Card`.

Workspace app names under `apps/` must use prefixes that match the deployment shape:

- `site-` for applications deployed as websites
- `app-` for applications deployed as installable apps
- `service-` for non-website services

Use these prefixes consistently in new workspace names, proposal examples, specs, and implementation plans.

## Zod

Use `z.uuid()` for UUID validation. Do not use `z.string().uuid()`.

## ORPC

Endpoints that do not use OpenAPI export should omit the `.route()` call. Use `.input().output().handler()` directly.

## Imports

Avoid dynamic `import()` unless statically linking causes a circular dependency or a module cannot be loaded at startup (e.g. the database is not yet configured). Static imports are preferred for type safety and bundler optimizations.
