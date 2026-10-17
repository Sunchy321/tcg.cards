import type { InferSelectModel } from 'drizzle-orm';
import { Format, Set as Series, SetLocalization, Booster } from '@tcg-cards/db/schema/shared/magic';
import type { LocalDb } from '../../hearthstone/hsdata-local-db';

/** Only exportable static tables participate; human choices and import caches stay local. */
export const referenceTables = {
  formats:  Format,
  sets:     Series,
  names:    SetLocalization,
  boosters: Booster,
} as const;
/** A single consistent local snapshot including the already-derived human display values. */
export type ReferenceSnapshot = { [K in keyof typeof referenceTables]: InferSelectModel<typeof referenceTables[K]>[] };
/** External boundary for inspecting a snapshot or atomically replacing its remote copy. */
export interface ReferenceStore {
  read(): Promise<ReferenceSnapshot>;
  replace(snapshot: ReferenceSnapshot): Promise<void>;
}

/** Reports the same complete dataset for dry runs and actual reference publishing. */
export async function publishReferences(store: ReferenceStore, dryRun: boolean) {
  const snapshot = await store.read();
  const totalRowCount = Object.values(snapshot).reduce((total, rows) => total + rows.length, 0);
  if (!dryRun) await store.replace(snapshot);
  return {
    formatCount:       snapshot.formats.length,
    setCount:          snapshot.sets.length,
    localizationCount: snapshot.names.length,
    boosterCount:      snapshot.boosters.length,
    sheetCount:        snapshot.boosters.reduce((n, b) => n + b.sheets.length, 0),
    sheetCardCount:    snapshot.boosters.reduce((n, b) => n + b.sheets.reduce((count, sheet) => count + sheet.cards.length, 0), 0),
    packCount:         snapshot.boosters.reduce((n, b) => n + b.packs.length, 0),
    packContentCount:  snapshot.boosters.reduce((n, b) => n + b.packs.reduce((count, pack) => count + pack.contents.length, 0), 0),
    totalRowCount,
    changedRowCount:   totalRowCount,
    dryRun,
  };
}

/** Reads a repeatable local snapshot and replaces remote children before their parents. */
export function referenceStore(local: LocalDb, remote: LocalDb): ReferenceStore {
  return {
    read: () => local.transaction(async tx => ({
      formats:  await tx.select().from(Format),
      sets:     await tx.select().from(Series),
      names:    await tx.select().from(SetLocalization),
      boosters: await tx.select().from(Booster),
    }), { isolationLevel: 'repeatable read', accessMode: 'read only' }),
    replace: snapshot => remote.transaction(async tx => {
      await tx.delete(Booster);
      await tx.delete(SetLocalization);
      await tx.delete(Series);
      await tx.delete(Format);
      // None of these rebuildable reference tables carries a deleted_at column.
      for (const key of Object.keys(referenceTables) as (keyof ReferenceSnapshot)[]) {
        const table = referenceTables[key];
        const rows = snapshot[key];
        for (let i = 0; i < rows.length; i += 100) {
          // Each mapped key binds its snapshot rows to that same table definition.
          await tx.insert(table).values(rows.slice(i, i + 100) as never[]);
        }
      }
    }),
  };
}
