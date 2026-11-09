import { eq, isNull } from 'drizzle-orm';

import type { createDb } from '@tcg-cards/db';
import { SearchPublicationMetadata } from '@tcg-cards/db/schema/remote';
import { SearchCard as MagicSearchCard, SearchCardPart as MagicSearchCardPart, SearchCardPartLocalization as MagicSearchCardPartLocalization, SearchCost as MagicSearchCost } from '@tcg-cards/db/schema/shared/magic/search';
import { SearchCard as HearthstoneSearchCard, SearchCardLocalization as HearthstoneSearchCardLocalization } from '@tcg-cards/db/schema/shared/hearthstone/search';
import { fingerprintSearchProjection } from '@tcg-cards/db/search-fingerprint';
import { LOCAL_SEARCH_SCHEMA_VERSIONS } from '@tcg-cards/model/search/publication';
import type { SearchPublicationGame } from '@tcg-cards/model/search/publication';

type SearchPublicationDb = Pick<ReturnType<typeof createDb>, 'select' | 'update' | 'insert'>;

/** Stops accelerated reads before a publisher starts applying projection chunks. */
export async function markSearchPublicationUnavailable(database: SearchPublicationDb, game: SearchPublicationGame): Promise<void> {
  await database.update(SearchPublicationMetadata)
    .set({ ready: false, updatedAt: new Date() })
    .where(eq(SearchPublicationMetadata.game, game));
}

/** Activates planner metadata only after every projection chunk has been applied. */
export async function activateSearchPublication(
  local: SearchPublicationDb,
  remote: SearchPublicationDb,
  game: SearchPublicationGame,
): Promise<boolean> {
  const [publication] = await local.select().from(SearchPublicationMetadata)
    .where(eq(SearchPublicationMetadata.game, game));
  if (publication == null || !publication.ready) {
    await markSearchPublicationUnavailable(remote, game);
    return false;
  }
  if (publication.schemaVersion !== LOCAL_SEARCH_SCHEMA_VERSIONS[game]
    || await fingerprintRemoteProjection(remote, game) !== publication.pgFingerprint) {
    await markSearchPublicationUnavailable(remote, game);
    return false;
  }

  await remote.insert(SearchPublicationMetadata).values({ ...publication, ready: true })
    .onConflictDoUpdate({
      target: SearchPublicationMetadata.game,
      set:    {
        dataVersion:     publication.dataVersion,
        pgFingerprint:   publication.pgFingerprint,
        releaseHash:     publication.releaseHash,
        schemaVersion:   publication.schemaVersion,
        ready:           true,
        plannerMetadata: publication.plannerMetadata,
        updatedAt:       new Date(),
      },
    });
  return true;
}

async function fingerprintRemoteProjection(database: SearchPublicationDb, game: SearchPublicationGame): Promise<string> {
  if (game === 'magic') {
    const cards = await database.select().from(MagicSearchCard).where(isNull(MagicSearchCard.deletedAt))
      .orderBy(MagicSearchCard.cardId, MagicSearchCard.version);
    const parts = await database.select().from(MagicSearchCardPart).where(isNull(MagicSearchCardPart.deletedAt))
      .orderBy(MagicSearchCardPart.cardId, MagicSearchCardPart.version, MagicSearchCardPart.partIndex);
    const localizations = await database.select().from(MagicSearchCardPartLocalization)
      .where(isNull(MagicSearchCardPartLocalization.deletedAt))
      .orderBy(
        MagicSearchCardPartLocalization.cardId,
        MagicSearchCardPartLocalization.version,
        MagicSearchCardPartLocalization.partIndex,
        MagicSearchCardPartLocalization.locale,
        MagicSearchCardPartLocalization.source,
      );
    const costs = await database.select().from(MagicSearchCost).where(isNull(MagicSearchCost.deletedAt))
      .orderBy(MagicSearchCost.cost);
    return fingerprintSearchProjection([['cards', cards], ['parts', parts], ['localizations', localizations], ['costs', costs]]);
  }
  const cards = await database.select().from(HearthstoneSearchCard).where(isNull(HearthstoneSearchCard.deletedAt))
    .orderBy(HearthstoneSearchCard.cardId);
  const localizations = await database.select().from(HearthstoneSearchCardLocalization)
    .where(isNull(HearthstoneSearchCardLocalization.deletedAt))
    .orderBy(HearthstoneSearchCardLocalization.cardId, HearthstoneSearchCardLocalization.lang);
  return fingerprintSearchProjection([['cards', cards], ['localizations', localizations]]);
}
