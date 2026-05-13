# `site-console`

Admin console for local data operations and import tooling.

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

Because of that runtime boundary, this package does not read a local `hsdata` git checkout and does not provide local git-backed `CardDefs.xml` import.

The current hsdata capabilities in site-console are limited to:

- browsing non-import hsdata-related console pages

## Notes

- There is no hsdata R2 upload step anymore.
- There is no `state.json`-based hsdata source sync anymore.
- hsdata import status and data table overview are only available in the desktop app.
- Local hsdata repository access is intended to live in the desktop app, not in site-console.
