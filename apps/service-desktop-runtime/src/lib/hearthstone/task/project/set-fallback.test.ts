import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { getLocalDb } from '../../hsdata-local-db';
import { Entity } from '@tcg-cards/db/schema/local/hearthstone';
import { projectExtracted } from './project';

describe('set fallback from hsdata', () => {
  test('resolves set from hsdata TAG 183 when unpack data lacks it', async () => {
    const db = getLocalDb();

    // TLC_233 at build 247416: unpack data has no TAG 183 (set).
    // hsdata has TAG 183 with intValue=1952 → HearthstoneSet dbfId 1952 → setId 'lcu'.
    const report = await projectExtracted(247416, ['TLC_233'], false);

    expect(report.insertedEntities + report.updatedEntities + report.reusedEntities).toBeGreaterThanOrEqual(1);

    const [entity] = await db.select({ set: Entity.set })
      .from(Entity).where(eq(Entity.cardId, 'TLC_233'));
    expect(entity).not.toBeNull();
    expect(entity!.set).toBe('lcu');
  });
});
