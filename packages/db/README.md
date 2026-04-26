# @tcg-cards/db

Database schema and migrations for TCG Cards project.

## Migration Workflow

### 1. Modify Schema

Edit files in `src/schema/` to change table structures.

```typescript
// src/schema/magic/rule.ts
export const RuleSource = pgTable('magic_rule_source', {
  id: text('id').primaryKey(),
  // ... add new fields
});
```

### 2. Generate Migration

```bash
bun run db:generate
```

This creates a new SQL file in `migrations/` with the changes.

### 3. Review Migration

Check the generated SQL file in `migrations/` before applying.

### 4. Push Schema (Development)

```bash
bun run db:push
```

This uses `DATABASE_URL_DEV`.
This loads `DATABASE_URL` from `.env.development`.

### 5. Apply Migration (Production)

Migrations are automatically applied in CI/CD, or manually:

```bash
bun run db:migrate
```

This uses `DATABASE_URL_PROD`.
This loads `DATABASE_URL` from `.env.production`.

## Environment Files

Configure separate database URLs for development and production:

```bash
cp .env.development.example .env.development
cp .env.production.example .env.production
```

Example contents:

```bash
# .env.development
DATABASE_URL="postgres://user:password@localhost:5432/tcg_cards_dev"
```

```bash
# .env.production
DATABASE_URL="postgres://user:password@localhost:5432/tcg_cards_prod"
```

## Scripts

| Script | Description |
|--------|-------------|
| `bun run db:generate` | Generate migration from schema changes |
| `bun run db:migrate` | Apply pending migrations to the production database |
| `bun run db:push` | Push schema directly to the development database |
| `bun run db:studio` | Open Drizzle Studio for the development database |
| `bun run db:check` | Check for schema drift |
| `bun run db:up` | Apply a single migration to the production database |

## Directory Structure

```
packages/db/
├── src/
│   ├── schema/           # Table definitions
│   │   ├── index.ts
│   │   └── magic/
│   ├── db.ts
│   └── index.ts
├── migrations/           # Generated SQL files (tracked by git)
│   ├── meta/
│   │   └── _journal.json
│   ├── 0000_initial.sql
│   └── 0001_xxx.sql
├── drizzle.config.ts     # Drizzle configuration
└── package.json
```

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
5. **Use transactions** for complex migrations (drizzle-kit does this automatically)
