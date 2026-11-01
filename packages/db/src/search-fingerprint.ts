import { createHash } from 'node:crypto';

/** Hashes deterministically ordered PostgreSQL projection rows, excluding write timestamps. */
export function fingerprintSearchProjection(tables: Array<[string, object[]]>): string {
  const hash = createHash('sha256');
  for (const [name, rows] of tables) {
    hash.update(name).update('\n');
    for (const row of rows) {
      const stable = Object.fromEntries(Object.entries(row).filter(([key]) =>
        key !== 'createdAt' && key !== 'updatedAt' && key !== 'deletedAt'));
      hash.update(JSON.stringify(stable)).update('\n');
    }
  }
  return hash.digest('hex');
}
