/** Exports the SQLite search schema directly from Drizzle definitions without a migration file. */
export function magicSnapshotDdl(): string {
  return drizzleSchemaExport('db:export:magic-search');
}

/** Exports the Hearthstone SQLite search schema from its Drizzle definitions. */
export function hearthstoneSnapshotDdl(): string {
  return drizzleSchemaExport('db:export:hearthstone-search');
}

/** Runs one of the database package's schema export scripts and strips its log prefix. */
function drizzleSchemaExport(script: string): string {
  const result = Bun.spawnSync(['bun', 'run', '--filter', '@tcg-cards/db', script]);
  if (result.exitCode !== 0) {
    throw new Error(`Drizzle schema export failed: ${result.stderr.toString()}`);
  }
  const prefix = `@tcg-cards/db ${script}: `;
  return result.stdout
    .toString()
    .split('\n')
    .filter(line => line.startsWith(prefix) && line !== `${prefix}Exited with code 0`)
    .map(line => line.slice(prefix.length))
    .join('\n');
}
