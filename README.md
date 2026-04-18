# TCG Cards

[![Bun](https://img.shields.io/badge/Bun-1.3.10-000000?logo=bun&logoColor=white)](https://bun.sh/)
[![Nuxt](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxtdotjs&logoColor=white)](https://nuxt.com/)
[![Turborepo](https://img.shields.io/badge/Turborepo-2-EF4444?logo=turborepo&logoColor=white)](https://turbo.build/repo)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-PostgreSQL-C5F74F?logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflareworkers&logoColor=white)](https://workers.cloudflare.com/)

TCG Cards is a Bun + Turborepo monorepo for building a shared data platform for multiple trading card games.

The long-term goal is to provide a reusable foundation for TCG card databases, including web search, app-facing queries, public API access, full database exports, and a simple path for extending the same capabilities to more TCGs.

The repository currently contains Nuxt applications for Magic: The Gathering, Hearthstone, a main landing site, an internal console, Cloudflare Worker automation, and shared packages for database schemas, domain models, search, UI, and configuration.

Chinese version: [README.zh-CN.md](./README.zh-CN.md)

## Tech Stack

- [Bun](https://bun.sh/) as the package manager and runtime for workspace scripts
- [Turborepo](https://turbo.build/repo) for monorepo task orchestration
- [Nuxt](https://nuxt.com/) and Vue for web applications
- [Nuxt UI](https://ui.nuxt.com/) and Tailwind CSS for UI
- [Drizzle ORM](https://orm.drizzle.team/) with PostgreSQL schemas
- [oRPC](https://orpc.unnoq.com/) for typed API handlers
- [Cloudflare Workers](https://workers.cloudflare.com/), Hyperdrive, R2, and KV for deployment and platform services

## Repository Layout

```text
apps/
  site-main/        Main tcg.cards site
  site-magic/       Magic: The Gathering site
  site-hearthstone/ Hearthstone site
  site-console/     Internal console and data tooling
  watcher/          Cloudflare Worker for scheduled automation

packages/
  db/               Drizzle schemas, migrations, and database utilities
  model/            Shared Zod domain models
  search/           Search models and helpers
  shared/           Shared constants and utility code
  ui/               Shared Nuxt UI layer and components
  tsconfig/         Shared TypeScript configuration
  eslint-config-custom/
                   Shared ESLint configuration

specs/              Approved design specs, reviews, and implementation plans
references/         Local/reference source material used for modeling
scripts/            Utility scripts
turbo/              Turborepo generators and templates
```

## Applications

| Workspace | Purpose | Default Dev Port |
|-----------|---------|------------------|
| `site-main` | Main public entry site | `3000` |
| `site-magic` | Magic: The Gathering data site | `3001` |
| `site-hearthstone` | Hearthstone data site | `3002` |
| `site-console` | Internal console for data and admin workflows | `2999` |
| `@tcg-cards/watcher` | Scheduled Cloudflare Worker | Wrangler default |

## Getting Started

### Prerequisites

- Bun `1.3.10` or compatible
- Node-compatible tooling required by Nuxt and Wrangler
- PostgreSQL connection when using database-backed features
- Cloudflare account and Wrangler configuration for deployment workflows

### Install Dependencies

```sh
bun install
```

### Configure Environment

Copy the example files for the workspaces you plan to run:

```sh
cp apps/site-magic/.env.example apps/site-magic/.env
cp apps/site-hearthstone/.env.example apps/site-hearthstone/.env
cp apps/site-console/.env.example apps/site-console/.env
cp apps/watcher/.dev.vars.example apps/watcher/.dev.vars
cp packages/db/.env.example packages/db/.env
```

Update the copied files with local database, Cloudflare, auth, and API credentials as needed.

### Run All Development Servers

```sh
bun run dev
```

This runs the monorepo `dev` pipeline through Turborepo. Long-running dev tasks are not cached.

### Run One App

```sh
cd apps/site-magic
bun run dev
```

Use the same pattern for `site-main`, `site-hearthstone`, and `site-console`.

## Common Commands

Run from the repository root unless noted otherwise.

| Command | Description |
|---------|-------------|
| `bun install` | Install workspace dependencies |
| `bun run dev` | Run all workspace development tasks through Turbo |
| `bun run check` | Run lint, typecheck, and build tasks across the monorepo |
| `bun run build` | Build all buildable workspaces |
| `bun run lint` | Run lint tasks across the monorepo |
| `bun run typecheck` | Run TypeScript checks across supported workspaces |
| `bun run postinstall` | Run post-install preparation tasks |
| `bun run gen <name>` | Generate a new site with the repository generator |

Per-app commands are available inside each app workspace:

```sh
cd apps/site-hearthstone
bun run build
bun run lint
bun run typecheck
```

## Database Workflow

Database schema code lives in `packages/db`.

```sh
cd packages/db
bun run db:generate
bun run db:migrate
bun run db:studio
```

The Drizzle configuration expects `DATABASE_URL` when running commands that connect to PostgreSQL.

## Deployment

Nuxt apps are configured for Cloudflare Workers through Nitro's Cloudflare module preset and app-level `wrangler.toml` files.

Typical deployment commands:

```sh
cd apps/site-magic
bun run build
bun run deploy
```

Not every app exposes a `deploy` script. Check the relevant workspace `package.json` and `wrangler.toml`.

Cloudflare bindings used across the apps include:

- Hyperdrive for PostgreSQL access
- R2 buckets for data and asset storage
- KV for watcher state
- Wrangler secrets for production-only values

## Design Specs

Approved design artifacts live under `specs/<topic>/` and use standard filenames:

- `design.md`
- `review.md`
- `plan.md`

## References

The `references/` directory contains local modeling references and upstream source material. Large raw source files should stay out of Git when covered by `.gitignore`, while small curated samples and notes can be committed when they are useful for design and implementation.

## License

This repository's original code and documentation are licensed under the [MIT License](./LICENSE).

Third-party game names, card text, card images, trademarks, and source data belong to their respective owners. This project is not affiliated with, endorsed by, or officially authorized by any TCG publisher.

See [LEGAL.md](./LEGAL.md) for third-party content, trademark, API, export, and takedown notices.
