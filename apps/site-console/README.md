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

## hsdata Upload Script

The package provides a Bun script that uploads the root-level `CardDefs.xml` from an `hsdata` checkout into the `R2_DATA` bucket.

Script entry:

```bash
cd apps/site-console
bun run hsdata:upload -- --dry-run
```

### Store the local repo path in `.git/config`

To avoid passing `--repo` every time, store the local `hsdata` checkout path in this repository's local Git config:

```bash
git config --local hearthstone.hsdata-repo /absolute/path/to/hsdata
```

The value is written to `.git/config`, so it stays local to your machine and is not committed.

### Upload flow

Run a dry run first:

```bash
cd apps/site-console
bun run hsdata:upload -- --dry-run
```

Upload to the remote R2 bucket:

```bash
cd apps/site-console
bun run hsdata:upload
```

List available `hsdata` Git tags with the `CardDefs.xml` build found at each tag:

```bash
cd apps/site-console
bun run hsdata:upload -- --list-tags
```

Upload the `CardDefs.xml` from a specific Git tag:

```bash
cd apps/site-console
bun run hsdata:upload -- --tag v31.0.0.3140
```

Upload the `CardDefs.xml` from any Git ref, branch, or commit:

```bash
cd apps/site-console
bun run hsdata:upload -- --ref 5d68a0171acb1ca504edf53cbeb283840a8f040e
```

Override the repo path for one-off runs:

```bash
cd apps/site-console
bun run hsdata:upload -- --repo /absolute/path/to/hsdata
```

Override the source tag:

```bash
cd apps/site-console
bun run hsdata:upload -- --source-tag 310295
```

Use local R2 storage instead of remote:

```bash
cd apps/site-console
bun run hsdata:upload -- --local
```

Show the full script help:

```bash
cd apps/site-console
bun run hsdata:upload -- --help
```
