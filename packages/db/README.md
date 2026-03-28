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

### 4. Apply Migration (Local)

```bash
bun run db:migrate
```

### 5. Apply Migration (Production)

Migrations are automatically applied in CI/CD, or manually:

```bash
DATABASE_URL="postgres://..." bun run db:migrate
```

## Scripts

| Script | Description |
|--------|-------------|
| `bun run db:generate` | Generate migration from schema changes |
| `bun run db:migrate` | Apply pending migrations |
| `bun run db:push` | Push schema directly (development only) |
| `bun run db:studio` | Open Drizzle Studio (GUI) |
| `bun run db:check` | Check for schema drift |
| `bun run db:up` | Apply single migration (up) |

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

## Best Practices

1. **Always review migrations** before applying to production
2. **Never edit generated SQL files** - regenerate instead
3. **Commit migrations** to git with the schema changes
4. **Test migrations** on a copy of production data first
5. **Use transactions** for complex migrations (drizzle-kit does this automatically)
