# `app-console-desktop`

Desktop admin console built with Tauri, Nuxt, and TypeScript.

Stable runtime and authority boundaries live in [../../docs/project-architecture.md](../../docs/project-architecture.md).

## Development

Install dependencies from the repository root:

```bash
bun install
```

Start the desktop app in development mode:

```bash
cd apps/app-console-desktop
bun run dev
```

Start the local Bun runtime in a separate terminal during development:

```bash
cd apps/service-desktop-runtime
bun run dev
```

## hsdata Local Repo Workflow

The desktop app remains the authority for local configuration and desktop-only workflows, while the Bun desktop runtime executes the local hsdata import, projection, and status APIs.

Current hsdata capabilities in the desktop app:

- store a local hsdata repository path in desktop app data
- inject the configured local database URL and hsdata repository path into the local Bun runtime
- inspect worktree and importable git tags that contain `CardDefs.xml` through the local Bun runtime
- import local hsdata XML into the local PostgreSQL database through the local Bun runtime
- trigger projection for an already imported `sourceTag` through the local Bun runtime
- publish the current local projection to the remote target from the desktop Rust shell

## Notes

- site-console does not read local git.
- service-internal does not read local git.
- In the current development shape, `service-desktop-runtime` still runs as an independent local process.
- Real end-to-end validation still requires a local hsdata checkout and a reachable backend auth/API environment.
