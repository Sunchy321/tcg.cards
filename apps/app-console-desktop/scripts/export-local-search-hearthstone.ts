import { hearthstoneSearchFtsSql } from '../electron/runtime/lib/search-publication/snapshot/hearthstone-fts-sql';
import { exportHearthstoneSearch } from '../electron/runtime/lib/search-publication/export-hearthstone';
import { hearthstoneSnapshotDdl } from './lib/search-database-ddl';

if (import.meta.main) {
  const connection = process.env.DATABASE_URL ?? process.env.DESKTOP_LOCAL_DATABASE_URL;
  const [output, ...locales] = process.argv.slice(2);
  if (!connection || !output || locales.length === 0) {
    throw new Error('Set DATABASE_URL and pass a new output directory followed by locale codes.');
  }
  await exportHearthstoneSearch(connection, output, locales, `${hearthstoneSnapshotDdl()}\n${await hearthstoneSearchFtsSql()}`);
}
