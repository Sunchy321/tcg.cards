import { and, eq } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';
import { SearchPublicationMetadata } from '@tcg-cards/db/schema/remote';
import { LOCAL_SEARCH_SCHEMA_VERSIONS } from '@tcg-cards/model/search/publication';
import type { SearchPublicationManifest } from '@tcg-cards/model/search/publication';

import { readLocalDatabaseUrl } from '../../runtime-config';

/** Records the complete candidate identity so later PG and D1 publication can match it. */
export async function persistPreparedReleaseHash(
  manifest: SearchPublicationManifest,
): Promise<void> {
  const connection = readLocalDatabaseUrl();
  if (connection == null) throw new Error('请先在桌面发布配置中连接本地数据库，再发布搜索数据。');
  const database = createDb(connection);
  try {
    const [publication] = await database.select().from(SearchPublicationMetadata)
      .where(eq(SearchPublicationMetadata.game, manifest.game));
    if (publication == null || !publication.ready
      || publication.dataVersion !== manifest.dataVersion
      || publication.pgFingerprint !== manifest.pgFingerprint
      || publication.schemaVersion !== manifest.schemaVersion
      || manifest.schemaVersion !== LOCAL_SEARCH_SCHEMA_VERSIONS[manifest.game]
      || !matchesPlannerMetadata(publication.plannerMetadata, manifest)) {
      throw new Error('本地搜索投影已变化，请重新导出全部搜索包后再发布。');
    }
    const [updated] = await database.update(SearchPublicationMetadata)
      .set({ releaseHash: manifest.releaseHash, updatedAt: new Date() })
      .where(and(
        eq(SearchPublicationMetadata.game, manifest.game),
        eq(SearchPublicationMetadata.dataVersion, manifest.dataVersion),
        eq(SearchPublicationMetadata.pgFingerprint, manifest.pgFingerprint),
        eq(SearchPublicationMetadata.ready, true),
      ))
      .returning({ game: SearchPublicationMetadata.game });
    if (updated == null) throw new Error('本地搜索投影已变化，请重新导出全部搜索包后再发布。');
  } finally {
    await database.$client.end({ timeout: 1 });
  }
}

/** Compares the stored planner metadata with the manifest's own planner identity. */
export function matchesPlannerMetadata(metadata: Record<string, unknown>, manifest: SearchPublicationManifest): boolean {
  if (manifest.game === 'hearthstone') return metadata.buildNumber === manifest.buildNumber;
  const symbols = metadata.typeSymbols;
  const owners = metadata.tagOwners;
  if (!Array.isArray(symbols) || symbols.some(value => typeof value !== 'string')
    || owners == null || typeof owners !== 'object' || Array.isArray(owners)) return false;
  const sortRecord = (value: Record<string, unknown>) => Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0),
  );
  return JSON.stringify(symbols) === JSON.stringify(manifest.typeSymbols)
    && JSON.stringify(sortRecord(owners as Record<string, unknown>))
    === JSON.stringify(sortRecord(manifest.tagOwners));
}
