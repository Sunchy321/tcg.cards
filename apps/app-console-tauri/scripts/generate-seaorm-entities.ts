/// <reference types="bun" />
/// <reference types="node" />

import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

/**
 * Target schema pull written into one desktop Rust entity directory.
 */
type EntityTarget = {
  schema: string;
  output: string;
};

const entityTargets: EntityTarget[] = [
  {
    schema: 'hearthstone_data',
    output: 'src-tauri/src/entity/hearthstone_data',
  },
  {
    schema: 'hearthstone',
    output: 'src-tauri/src/entity/hearthstone',
  },
];

/**
 * Usage text printed for one invalid script invocation.
 */
function buildUsage(): string {
  return [
    'Usage:',
    '  bun run db:pull',
    '  DATABASE_URL=postgres://... bun scripts/generate-seaorm-entities.ts',
  ].join('\n');
}

/**
 * Required DATABASE_URL loaded from the current process environment.
 */
function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();

  if (value == null || value.length === 0) {
    throw new Error('DATABASE_URL is required.\n\n' + buildUsage());
  }

  return value;
}

/**
 * Installed sea-orm-cli binary resolved from environment or common Rust locations.
 */
function resolveSeaOrmCli(): string {
  const explicitPath = process.env.SEA_ORM_CLI?.trim();

  if (explicitPath != null && explicitPath.length > 0) {
    return explicitPath;
  }

  const pathBinary = Bun.which('sea-orm-cli');

  if (pathBinary != null) {
    return pathBinary;
  }

  const cargoBinary = resolve(homedir(), '.cargo/bin/sea-orm-cli');

  if (existsSync(cargoBinary)) {
    return cargoBinary;
  }

  throw new Error(
    [
      'sea-orm-cli is not installed or not available in PATH.',
      'Install a matching CLI first:',
      '  cargo install sea-orm-cli --version 1.1.20 --locked',
      'Or point the script to a custom binary path:',
      '  SEA_ORM_CLI=/absolute/path/to/sea-orm-cli bun run db:pull',
    ].join('\n'),
  );
}

/**
 * SeaORM entity generation command executed for one schema pull.
 */
function generateEntity(databaseUrl: string, target: EntityTarget): void {
  const { schema, output } = target;
  const outputPath = resolve(output);
  const seaOrmCli = resolveSeaOrmCli();

  mkdirSync(outputPath, { recursive: true });

  const result = Bun.spawnSync({
    cmd: [
      seaOrmCli,
      'generate',
      'entity',
      '-u',
      databaseUrl,
      '-s',
      schema,
      '-o',
      outputPath,
    ],
    cwd:    process.cwd(),
    stdout: 'inherit',
    stderr: 'inherit',
  });

  if (!result.success) {
    const status = result.exitCode ?? 1;
    throw new Error(
      [
        `sea-orm-cli exited with status ${status} while pulling schema ${schema}.`,
        'Install a matching CLI first if it is missing:',
        '  cargo install sea-orm-cli --version 1.1.20 --locked',
      ].join('\n'),
    );
  }
}

/**
 * Full desktop entity pull executed against all required PostgreSQL schemas.
 */
function run(): void {
  const databaseUrl = requireDatabaseUrl();

  if (process.argv.length > 2) {
    throw new Error('This script does not accept extra arguments.\n\n' + buildUsage());
  }

  for (const target of entityTargets) {
    generateEntity(databaseUrl, target);
  }
}

run();
