import { createHash } from 'node:crypto';

/** Describes one row in the ordered publication manifest. */
export interface ManifestRow {
  tableName: string;
  rowKey:    string;
  rowHash:   string | null;
}

/** Hashes the existing JSON array format without allocating one dataset-sized string. */
export function hashManifest(rows: Iterable<ManifestRow>): string {
  const hash = createHash('sha256');
  hash.update('[');
  let separator = '';
  for (const row of rows) {
    hash.update(separator);
    hash.update(JSON.stringify(row));
    separator = ',';
  }
  hash.update(']');
  return hash.digest('hex');
}
