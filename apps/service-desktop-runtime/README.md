# service-desktop-runtime (deprecated)

**This package is deprecated and will be removed entirely in a future version.**

It is the former Bun desktop runtime behind `app-console-tauri` (deprecated).
No application depends on it any more:

- The search projection and publication workflows (Magic and Hearthstone search
  tables, pinyin derivation, the cost dictionary, search publication activation)
  have moved into the Electron runtime of `app-console-desktop` under
  `electron/runtime/lib/`. The Electron console is the only runtime that
  executes these workflows.
- `site-magic` no longer depends on this package; its former benchmark scripts
  that imported the rebuild from here are archived under `scripts/archive/`.

Do not add new features here. Changes to data workflows belong in
`app-console-desktop`. What remains in this package (the other legacy
workflows, the Hearthstone card projection test fixtures and the
`generate-card-test` CLI) will be migrated or dropped when the package is
removed.
