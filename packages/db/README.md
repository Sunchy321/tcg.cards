# @tcg-cards/db

Database schema and migrations for TCG Cards project.

## Schema Tracks

This package now maintains two database tracks:

- `local`: desktop-side local PostgreSQL used for import, build, and local review state
- `remote`: remote PostgreSQL used for serving, remote-only app data, and control-plane tables

Shared tables stay in `src/schema/shared/`. Track-specific aggregators live under:

- `src/schema/local/`
- `src/schema/remote/`
- `src/schema/shared/`

Game-specific tables must stay under per-game entry folders:

- `src/schema/shared/{game}/index.ts`
- `src/schema/local/{game}/index.ts`
- `src/schema/remote/{game}/index.ts`

Non-game tables stay directly under their ownership track, for example:

- `src/schema/remote/auth.ts`

## Migration Workflow

### 1. Modify Schema

Edit the schema files under the ownership track they belong to. For game-specific tables, update the matching per-game `index.ts` when a table should be exposed from that track.

```typescript
// src/schema/shared/magic/rule.ts
export const RuleSource = pgTable('magic_rule_source', {
  id: text('id').primaryKey(),
  // ... add new fields
});
```

### 2. Generate Migration

```bash
bun run db:generate:local
bun run db:generate:remote
```

Use the script that matches the target track:

- `db:generate:local` writes to `migrations/local`
- `db:generate:remote` writes to `migrations/remote`

### 3. Review Migration

Check the generated SQL file in the matching migration directory before applying.

### 4. Push Schema (Development)

```bash
bun run db:push:local:dev
bun run db:push:remote:dev
```

These scripts target the explicit schema track and load `DATABASE_URL` from the matching env file.

### 5. Apply Migration (Production)

Migrations are automatically applied in CI/CD, or manually:

```bash
bun run db:migrate:local:dev
bun run db:migrate:remote:dev
bun run db:migrate:remote:prod
```

Each script targets one schema track and one instance environment.

## Environment Files

Configure separate database URLs for each tracked workflow:

```bash
cp .env.local-dev.example .env.local-dev
cp .env.remote-dev.example .env.remote-dev
cp .env.remote-prod.example .env.remote-prod
```

Example contents:

```bash
# .env.local-dev
DATABASE_URL="postgres://user:password@localhost:5432/tcg_cards_local_dev"
```

```bash
# .env.remote-dev
DATABASE_URL="postgres://user:password@localhost:5432/tcg_cards_remote_dev"
```

```bash
# .env.remote-prod
DATABASE_URL="postgres://user:password@db.example.com:5432/tcg_cards_remote_prod"
```

## Scripts

| Script | Description |
|--------|-------------|
| `bun run db:generate:local` | Generate a local migration |
| `bun run db:generate:remote` | Generate a remote migration |
| `bun run db:migrate:local:dev` | Apply local-track migrations to the dev local instance |
| `bun run db:migrate:remote:dev` | Apply remote-track migrations to the dev remote instance |
| `bun run db:migrate:remote:prod` | Apply remote-track migrations to the prod remote instance |
| `bun run db:push:local:dev` | Push the local schema directly to the dev local instance |
| `bun run db:push:remote:dev` | Push the remote schema directly to the dev remote instance |
| `bun run db:studio:local:dev` | Open Drizzle Studio for the dev local instance |
| `bun run db:check:local` | Check local schema drift |
| `bun run db:check:remote` | Check remote schema drift |
| `bun run db:up:remote:prod` | Apply a single migration to the prod remote instance |

## Directory Structure

```
packages/db/
├── src/
│   ├── schema/
│   │   ├── shared/       # Shared-track entries grouped by game
│   │   ├── local/        # Local-track entries plus local non-game tables
│   │   ├── remote/       # Remote-track entries plus remote non-game tables
│   ├── db.ts
│   └── index.ts
├── migrations/
│   ├── local/            # Local-track migrations
│   └── remote/           # Remote-track migrations
├── drizzle.local.config.ts
├── drizzle.remote.config.ts
├── drizzle.config.ts     # Remote alias for backward compatibility
└── package.json
```

## Naming Rules

- `local / remote` always describe the schema track
- `dev / prod` always describe the target instance environment
- Commands that touch a real database instance must encode both dimensions in their name

## Database Design Guidelines

Use `{game}` as the base namespace and keep data split by responsibility:

- `{game}` stores all static data and should remain exportable for standalone use
- `{game}_data` stores externally sourced data and import configuration
- `{game}_app` stores all user data

Keep these boundaries strict so static data, import pipelines, and application data do not get mixed together.

## Table Placement Checklist

Before adding a new table, classify it with the following checklist:

1. If the data is stable domain data that can be exported and used independently, place it in `{game}`.
2. If the data comes from external sources, import jobs, import configuration, or intermediate import cache, place it in `{game}_data`.
3. If the data is created by users or depends on user accounts, user behavior, user settings, or application state, place it in `{game}_app`.

Additional rules:

- Each table should have one primary responsibility.
- If a table mixes static data, import state, and user state, split it before adding it.
- If the placement is unclear, resolve it before implementation instead of choosing a schema arbitrarily.

## Best Practices

1. **Always review migrations** before applying to production
2. **Never edit generated SQL files** - regenerate instead
3. **Commit migrations** to git with the schema changes
4. **Test migrations** on a copy of production data first
5. **Keep local and remote track ownership explicit** instead of assuming one schema fits both
