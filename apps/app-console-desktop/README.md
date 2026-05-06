# `app-console-desktop`

Desktop admin console built with Tauri, Nuxt, and TypeScript.

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

## hsdata Local Repo Workflow

The desktop app is the local runtime that owns hsdata git access.

Current hsdata capabilities in the desktop app:

- store a local hsdata repository path in desktop app data
- inspect worktree and importable git tags that contain `CardDefs.xml`
- read local XML and send it to the worker-safe hsdata import API
- trigger projection for an already imported `sourceTag`

## Notes

- site-console does not read local git.
- service-internal does not read local git.
- Real end-to-end validation still requires a local hsdata checkout and a reachable backend auth/API environment.
