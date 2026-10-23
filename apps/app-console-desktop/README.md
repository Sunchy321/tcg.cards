# `app-console-desktop`

Electron replacement for the desktop management console. The former Tauri implementation is preserved in the independent `app-console-tauri` workspace during migration. Stable boundaries are documented in [the project architecture](../../docs/project-architecture.md) and [ADR-0019](../../docs/adr/0019-electron-replaces-tauri-console.md).

## Development

Install workspace dependencies from the repository root with `bun install`, then run `bun run dev` in this app. Nuxt starts on port **1420**, and `nuxt-electron` builds and starts Electron. Main/business changes restart Electron; preload changes reload the page; Vue changes use Nuxt HMR. No separate Bun business server is needed. The legacy Tauri app uses port **1421**.

Use `bun run dev:web` to run Nuxt and the Electron build watchers without opening Electron. After building, `bun run preview` opens the static application.

The shell opens local management without signing in. Settings, tasks, publishing authentication, and game workflows are migrated through separate tickets; existing Tauri features are not yet all available in Electron.

## Verification

- `bun run typecheck` checks the renderer and Electron entries.
- `bun run build` generates Nuxt static assets and all Electron entries through `nuxt-electron`.
- After building, `bun run test:electron` exercises a hidden Electron window and IPC bridge using static assets and an isolated temporary profile. Set `VITE_DEV_SERVER_URL=http://localhost:1420` to exercise the development server instead.
- `bun run package:electron` creates a macOS application; `bun run make:electron` also creates its ZIP distribution. Signing, notarization, and automatic updates are not configured.

Installed execution uses Electron's bundled Node.js, not a system Bun runtime. PostgreSQL and existing external tools remain separately managed.

## Scaffold provenance

Recreated from the author's [nuxt-electron quick-start](https://github.com/caoxiemeihao/nuxt-electron/tree/main/quick-start), generated on 2026-10-24 using Nuxt CLI 3.33.1:

```sh
bun x nuxt init /private/tmp/tcg-nuxt-electron-starter-20261024 \
  --template gh:caoxiemeihao/nuxt-electron/quick-start \
  --no-install --no-gitInit --packageManager bun
```

The generated template supplies the Nuxt module integration, `--no-fork` development command, Electron entries, preload reload pattern, and static-build flow. Adaptations align Nuxt/Vue/Electron versions with this workspace, retain Forge instead of the example's electron-builder, reuse the console layers, and restrict IPC rather than copy the demo's generic IPC bridge. Renderer Node polyfills are omitted. The existing secure app protocol is retained, so the module's default file-URL path rewrites are disabled. Main and business entries build together, with startup waiting for preload as well. Pure renderer and build-time dependencies are development dependencies; no package manifest rewrite is needed during packaging.
