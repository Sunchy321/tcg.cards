import { expect, test } from 'bun:test';
import { getTableName } from 'drizzle-orm';
import { referenceTables, publishReferences, type ReferenceSnapshot } from './publish';

test('publishes static series and complete booster tables while excluding human configuration', async () => {
  expect(Object.values(referenceTables).map(getTableName)).toEqual([
    'formats', 'sets', 'set_localizations', 'boosters',
  ]);
  const snapshot: ReferenceSnapshot = { formats: [], sets: [], names: [], boosters: [] };
  let writes = 0;
  const result = await publishReferences({
    read:    async () => snapshot,
    replace: async rows => {
      expect(rows).toBe(snapshot);
      writes++;
    } }, true);
  expect(result.totalRowCount).toBe(0);
  expect(writes).toBe(0);
  await publishReferences({
    read:    async () => snapshot,
    replace: async () => {
      writes++;
    } }, false);
  expect(writes).toBe(1);
});
