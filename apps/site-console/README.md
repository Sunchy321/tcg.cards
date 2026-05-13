# `site-console`

Lower-capability web management surface for remote-backed console workflows.

Stable runtime and authority boundaries live in [../../docs/project-architecture.md](../../docs/project-architecture.md).

## Development

Install dependencies from the repository root:

```bash
bun install
```

Start the console in development mode:

```bash
cd apps/site-console
bun run dev
```

## hsdata Workflow

site-console runs on Cloudflare Workers.

Because of that runtime boundary, this package does not read a local `hsdata` git checkout and does not provide local git-backed `CardDefs.xml` import or other heavy domain-data execution paths.

The current hsdata capabilities in site-console are limited to:

- browsing overview-oriented hsdata console pages
- performing only lightweight remote-backed management actions that fit the web runtime boundary

## Notes

- There is no hsdata R2 upload step anymore.
- There is no `state.json`-based hsdata source sync anymore.
- Heavy hsdata import, projection, and local repository access belong to the desktop app.
- Local hsdata repository access is intended to live in the desktop app, not in site-console.
