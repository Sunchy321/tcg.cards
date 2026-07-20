#!/usr/bin/env bun

/**
 * Decompiles the CardTextBuilderType enum from the Hearthstone game assembly
 * via ILSpy, then updates the TypeScript zod enum definition.
 *
 * Usage:
 *   bun run scripts/hearthstone/sync-text-builder-type.ts [--dry-run]
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ASSEMBLY_DLL = '/Applications/Hearthstone/Hearthstone.app/Contents/Resources/Data/Managed/Assembly-CSharp.dll';

const MODEL_PATH = resolve(
  import.meta.dir,
  '..',
  '..',
  'packages',
  'model',
  'src',
  'hearthstone',
  'schema',
  'entity.ts',
);

/** Extracts enum member names from the decompiled C# source. */
function parseEnum(source: string): string[] {
  const match = source.match(/enum\s+CardTextBuilderType\s*\{([^}]+)\}/s);
  if (!match) throw new Error('Could not find CardTextBuilderType enum.');
  return match[1]!
    .split('\n')
    .map(l => l.trim().replace(/,$/, ''))
    .filter(l => l.length > 0 && !l.startsWith('//'));
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('[DRY RUN] No changes will be written.\n');

  // Run ILSpy to decompile just the Card class
  console.log(`Running ilspycmd -t Assets.Card...`);
  const csharp = execSync(
    `ilspycmd -t Assets.Card "${ASSEMBLY_DLL}"`,
    { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
  );

  const csMembers = parseEnum(csharp);
  console.log(`Found ${csMembers.length} enum values.`);

  // Convert UPPER_SNAKE_CASE → lowercase
  const tsValues = csMembers.map(name => `'${name.toLowerCase()}'`);
  const tsBlock = tsValues.map(v => `  ${v}`).join(',\n') + ',';

  // Update entity.ts
  const tsSource = readFileSync(MODEL_PATH, 'utf-8');
  const marker = 'export const textBuilderType = z.enum([';
  const start = tsSource.indexOf(marker);
  if (start === -1) throw new Error('Could not find textBuilderType enum in entity.ts.');
  const arrayStart = start + marker.length;
  const end = tsSource.indexOf(']);', arrayStart);
  if (end === -1) throw new Error('Could not find closing ]); after textBuilderType enum.');

  const newSource = tsSource.slice(0, arrayStart) + '\n' + tsBlock + '\n' + tsSource.slice(end);
  if (newSource === tsSource) {
    console.log('Enum is already up to date.');
    return;
  }

  if (dryRun) {
    // Show diff
    const oldValues = tsSource.slice(arrayStart, end)
      .split('\n').map(l => l.trim().replace(/,$/, '')).filter(l => l.startsWith("'"));
    const newValues = tsBlock.split('\n')
      .map(l => l.trim().replace(/,$/, '')).filter(l => l.startsWith("'"));
    console.log(`Would add:    ${newValues.filter(v => !oldValues.includes(v)).join(', ') || '(none)'}`);
    console.log(`Would remove: ${oldValues.filter(v => !newValues.includes(v)).join(', ') || '(none)'}`);
    console.log('\n[Dry run complete.]');
    return;
  }

  writeFileSync(MODEL_PATH, newSource, 'utf-8');
  console.log('Updated entity.ts — done.');
}

main();
