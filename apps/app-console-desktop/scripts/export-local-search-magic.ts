import { magicSearchFtsSql } from '../electron/runtime/lib/search-publication/snapshot/magic-d1-snapshot';
import { exportMagicSearch } from '../electron/runtime/lib/search-publication/export-magic';
import { magicSnapshotDdl } from './lib/search-database-ddl';

if (import.meta.main) {
  const connection = process.env.DATABASE_URL ?? process.env.DESKTOP_LOCAL_DATABASE_URL;
  const [output, ...locales] = process.argv.slice(2);
  if (!connection || !output || locales.length === 0) {
    throw new Error('Set DATABASE_URL and pass a new output directory followed by locale codes.');
  }
  await exportMagicSearch(connection, output, locales, `${magicSnapshotDdl()}\n${await magicSearchFtsSql()}`);
}
