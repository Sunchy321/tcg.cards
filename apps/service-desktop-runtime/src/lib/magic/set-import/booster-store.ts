import { eq, isNull, sql } from 'drizzle-orm';
import { MtgjsonSet } from '@tcg-cards/db/schema/local/magic';
import { Booster } from '@tcg-cards/db/schema/shared/magic/set';
import type { LocalDb } from '../../hearthstone/hsdata-local-db';
import type { BoosterStore } from './boosters';

/** Provides per-series source reads and atomic complete replacements for booster imports. */
export function boosterStore(database: LocalDb): BoosterStore {
  return {
    read: async setId => {
      const [row] = await database.select({ data: MtgjsonSet.data }).from(MtgjsonSet)
        .where(sql`lower(${MtgjsonSet.setId}) = ${setId} and ${isNull(MtgjsonSet.deletedAt)}`);
      return row?.data;
    },
    replace: async (setId, rows) => {
      await database.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'magic:set:' + setId}))`);
        // The complete series is validated before entering this replacement transaction.
        await tx.delete(Booster).where(eq(Booster.setId, setId));
        for (let i = 0; i < rows.length; i += 100) {
          await tx.insert(Booster).values(rows.slice(i, i + 100));
        }
      });
    },
  };
}
