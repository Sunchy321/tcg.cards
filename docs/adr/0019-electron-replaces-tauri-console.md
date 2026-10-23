# 0019: Electron replaces the Tauri management console

**Status:** Accepted; migration in progress. Remote-access authentication details remain a separate design checkpoint.

The management console moves from Tauri/Rust plus a separately started Bun business service to Electron and TypeScript/Node.js. The renderer keeps the Nuxt console UI, the main process owns native lifecycle and configuration, and isolated Node.js processes execute local business work through a restricted preload/IPC boundary. The application will completely replace the former desktop implementation, not remain a second permanent management product.

The former application moves to the independent `app-console-tauri` workspace. The new Electron application occupies `app-console-desktop` and reuses shared console packages, without depending on the old application. Keeping separate workspaces allows an immediately runnable Electron shell and then core settings, tasks, and publishing capabilities before migrating game workflows. Existing UI and business behavior remain the migration baseline.

**Why:** Retaining Bun as a managed sidecar would reduce conversion work, but retain two runtime environments and the associated distribution and lifecycle burden. Replacing only the window shell would not achieve the user's goals of removing Rust, consolidating TypeScript execution, and simplifying startup and packaging. Moving the existing application in place was also rejected in favor of an independent replacement workspace with a retained old implementation during migration.

Local management does not require login. Authentication for remote database access is designed with publishing rather than used as an application startup gate. This decision does not itself specify remote authorization or permit anonymous remote access. The web console remains a separate restricted management surface; database ownership and synchronization rules do not change. PostgreSQL, Git, repositories, and external tools remain externally managed.

Initial delivery is a personal macOS application using Electron Forge, without signing, notarization, or automatic updates. Existing settings and readable credentials are inherited; sensitive settings use Electron safeStorage. Closing the window leaves local work running; quitting with active tasks requires confirmation and safe shutdown. Bun remains available as repository tooling and a test runner, but is not a dependency of installed desktop execution.

This supersedes ADR-0016's description of the management console as retaining a Bun sidecar. It does not change that ADR's user-facing query application family or ADR-0007's restrictions on mobile management and desktop task gateways.

The shell is rebuilt from the community `nuxt-electron` quick-start using Nuxt CLI. `nuxt-electron` owns development startup, entry compilation, and reload integration; Forge remains responsible for packaging. The Nuxt renderer and shared layers stay in place. Main, preload, and business-process boundaries remain application responsibilities rather than generic renderer Node access. This replaces the initial hand-written esbuild and development-launch scripts.
