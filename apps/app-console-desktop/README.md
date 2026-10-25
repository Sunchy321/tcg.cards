# `app-console-desktop`

Electron replacement for the desktop management console. The former Tauri implementation is preserved in the independent `app-console-tauri` workspace during migration. Stable boundaries are documented in [the project architecture](../../docs/project-architecture.md) and [ADR-0019](../../docs/adr/0019-electron-replaces-tauri-console.md).

## Development

Install workspace dependencies from the repository root with `bun install`, then run `bun run dev` in this app. Nuxt starts on port **1420**, and `nuxt-electron` builds and starts Electron. Main/business changes restart Electron; preload changes reload the page; Vue changes use Nuxt HMR. No separate Bun business server is needed. The legacy Tauri app uses port **1421**.

Use `bun run dev:web` to run Nuxt and the Electron build watchers without opening Electron. After building, `bun run preview` opens the static application.

The shell opens local management without signing in. Settings and the initial task runtime are available locally; publishing admission and game workflows are migrated through separate tickets. Existing Tauri features are not yet all available in Electron.

## Remote session

Settings → 远端登录 signs in to the deployed web console (`/auth` endpoints, better-auth) with the console service address, username and password. The session cookie is encrypted as the `remote-session` secret and persists across restarts until logout or expiry; local features never require it. Operations gated on a remote session guide to that page and return afterwards — the `/dev/auth` page exercises the flow, and `bun run test:auth` verifies the login, guidance, restart persistence and secret handling against a stub console backend. Admission checks for publishing are separate migration work ([ADR-0021](../../docs/adr/0021-desktop-publish-authorization.md)).

## Verification

- `bun run typecheck` checks the renderer and Electron entries.
- `bun run build` generates Nuxt static assets and all Electron entries through `nuxt-electron`.
- After building, `bun run test:electron` exercises a hidden Electron window and IPC bridge using static assets and an isolated temporary profile.
- `bun run package:electron` creates a macOS application; `bun run make:electron` also creates its ZIP distribution. Signing, notarization, and automatic updates are not configured.
- If the Electron ZIP is already available locally, set `ELECTRON_ZIP_DIR` to its containing directory when packaging to avoid a download.

Installed execution uses Electron's bundled Node.js, not a system Bun runtime. PostgreSQL and existing external tools remain separately managed.

## Tasks

The task host is a long-lived Electron utility process. It records runs and stages in the configured local PostgreSQL database and starts Worker threads for task definitions. Each task calls the framework's `registerTask` from a `*.task.ts` module under the Electron business source tree. The build discovers those lightweight modules automatically; the definition is loaded in a Worker only when requested.

The `/dev/tasks` page starts a short development task. `/tasks` and the header task button show unfinished runs from the task host. The development task requires a local PostgreSQL connection under Settings → Database; it does not read game or remote data. Run `bun --env-file=../../packages/db/.env.local-dev run test:tasks` from this app to exercise the page, IPC, host, Worker, progress and completion against the configured local development database. The test is skipped when `DATABASE_URL` is absent.

Closing the window or rebuilding pages does not disturb running tasks. When the app restarts, the host classifies unfinished runs once per database before serving reads: runs stopped inside a stage with a durable checkpoint wait as `interrupted` for a manual continue that relaunches a Worker from the persisted progress, manually paused recoverable runs keep their pause, and the rest are abandoned, freeing their task type.

Quitting with unfinished tasks asks for confirmation first; canceling leaves the tasks untouched. A confirmed quit stops accepting new task work, stops every Worker at its current safe boundary, and applies the same classification immediately: recoverable runs become `interrupted`, unrecoverable ones are abandoned, and manual pauses keep their pause. Nothing continues automatically on the next launch. A crashed task host is restarted by the main process, and the recovery scan reruns so unfinished runs are reclassified instead of remaining displayed as running.

## Scaffold provenance

Recreated from the author's [nuxt-electron quick-start](https://github.com/caoxiemeihao/nuxt-electron/tree/main/quick-start), generated on 2026-10-24 using Nuxt CLI 3.33.1:

```sh
bun x nuxt init /private/tmp/tcg-nuxt-electron-starter-20261024 \
  --template gh:caoxiemeihao/nuxt-electron/quick-start \
  --no-install --no-gitInit --packageManager bun
```

The generated template supplies the Nuxt module integration, `--no-fork` development command, Electron entries, preload reload pattern, and static-build flow. Adaptations align Nuxt/Vue/Electron versions with this workspace, retain Forge instead of the example's electron-builder, reuse the console layers, and restrict IPC rather than copy the demo's generic IPC bridge. Renderer Node polyfills are omitted. The existing secure app protocol is retained, so the module's default file-URL path rewrites are disabled. Main and business entries build together, with startup waiting for preload as well. Pure renderer and build-time dependencies are development dependencies; no package manifest rewrite is needed during packaging.

## Settings

Settings are owned by the main process and persisted with `electron-store` in Electron's `userData` directory (`settings.json`). Public configuration and encrypted credentials are separate sections of the stored envelope. The advanced editor reads and replaces only public configuration; it cannot read or write secret values. Database connection strings are stored as complete encrypted values. `safeStorage` must be available; failures never fall back to plaintext.

Inputs save after blur or Enter, and selects save after a completed selection. Invalid edits retain the previously saved value. The advanced JSON editor requires explicit save, rejects unsupported fields, and prompts before discarding unsaved changes. A running task must retain a detached configuration and credential snapshot obtained at its start; changes apply to subsequent tasks.

First startup reads the former Tauri configuration under `~/Library/Application Support/cards.tcg.console-desktop/` and the existing `tcg-cards-console-desktop` Keychain service. Ordinary values are validated and credentials are encrypted before persistence. Diagnostic outcomes are retained per category, including partial failures; inheritance information is not displayed in the UI. The old files and Keychain entries remain untouched, and later starts do not overwrite the new settings. Old session material is archived encrypted, without restoring a logged-in session.

Legacy nested path overrides are converted to declared dotted keys in the public `paths` object. Explicit paths remain valid without existing folders; derived game paths are returned only when their folders exist and are never persisted by reading them. This also allows a game root and its individual overrides to coexist.

Development launches authenticate the Nuxt instance with a fresh challenge and HMAC before opening the renderer and on privileged requests. An unrelated service on port 1420 is insufficient. Launch through `bun run dev`; manually setting `VITE_DEV_SERVER_URL` without the matching launch identity will be rejected.

`bun run test:settings` exercises configuration, secret failure, inheritance and development trust boundaries. `bun run test:electron` additionally tests the settings UI in a hidden application with temporary user data. Smoke-test launches never read legacy files or credentials. Set `ELECTRON_TEST_EXECUTABLE` to the packaged macOS executable to run the settings UI test against it. The encryption integration test uses only generated temporary values with real OS encryption. Inheritance from your actual legacy environment remains part of manual verification.
