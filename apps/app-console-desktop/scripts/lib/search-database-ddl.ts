import { execFileSync } from 'node:child_process';

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
  const result = execFileSync('bun', ['run', '--filter', '@tcg-cards/db', script], { encoding: 'utf8' });
  const prefix = `@tcg-cards/db ${script}: `;
  return result
    .split('\n')
    .filter(line => line.startsWith(prefix) && line !== `${prefix}Exited with code 0`)
    .map(line => line.slice(prefix.length))
    .join('\n');
}
