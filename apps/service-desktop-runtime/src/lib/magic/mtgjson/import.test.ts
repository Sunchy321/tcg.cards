import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PgDialect } from 'drizzle-orm/pg-core';
import { type SQL } from 'drizzle-orm';
import { runWithDb } from '@tcg-cards/db';
import { type db } from '@tcg-cards/db/db';
import { finalizeMtgjsonSets } from './import';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

/** Captures rows selected for deletion while running the real finalization logic. */
function storage(setIds: string[]) {
  const deleted: string[] = [];
  const database = {
    select: () => ({ from: () => ({ where: async () => setIds.map(setId => ({ setId })) }) }),
    update: () => ({ set: () => ({ where: async (condition: SQL) => {
      deleted.push(...new PgDialect().sqlToQuery(condition).params.map(String));
    } }) }),
  };
  return { database: database as unknown as typeof db, deleted };
}

test('keeps the internal series code when its filename differs and deletes genuinely missing series', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mtgjson-finalize-'));
  directories.push(dir);
  await Bun.write(join(dir, 'CON_.json'), JSON.stringify({ data: { code: 'CON' } }));
  await Bun.write(join(dir, 'ALA.json'), JSON.stringify({ data: { code: 'ALA' } }));
  const { database, deleted } = storage(['CON', 'ALA', 'OLD']);

  const count = await runWithDb(database, () => finalizeMtgjsonSets(dir));

  expect(deleted).toEqual(['OLD']);
  expect(count).toBe(1);
});

test('does not delete any series if a source file has no valid internal code', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mtgjson-finalize-'));
  directories.push(dir);
  await Bun.write(join(dir, 'CON_.json'), JSON.stringify({ data: {} }));
  const { database, deleted } = storage(['CON']);

  await expect(runWithDb(database, () => finalizeMtgjsonSets(dir))).rejects.toThrow();
  expect(deleted).toEqual([]);
});
