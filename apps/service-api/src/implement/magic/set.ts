import { ORPCError } from '@orpc/server';

import { eq } from 'drizzle-orm';

import { os } from '../../orpc';

import { db } from '@tcg-cards/db';
import { Set, Booster } from '@tcg-cards/db/schema/shared/magic/set';
import type { Rarity } from '@tcg-cards/model/magic/schema/basic';

const detail = os.magic.set.detail
  .handler(async ({ input }) => {
    const row = await db.select()
      .from(Set)
      .where(eq(Set.setId, input.setId))
      .then(rows => rows[0]);

    if (row == null) {
      throw new ORPCError('NOT_FOUND');
    }

    const boosters = await db.select({
      boosterId:   Booster.boosterId,
      totalWeight: Booster.totalWeight,
      packs:       Booster.packs,
      sheets:      Booster.sheets,
    }).from(Booster).where(eq(Booster.setId, input.setId));

    return {
      setId:  row.setId,
      block:  row.block ?? null,
      parent: row.parent ?? null,

      baseSetSize:  row.baseSetSize ?? null,
      totalSetSize: row.totalSetSize ?? null,
      printedSize:  row.printedSize ?? null,
      cardCount:    row.cardCount,
      langs:        row.langs,
      // The column is a plain text array; output validation rejects off-enum values.
      rarities:     row.rarities as Rarity[],

      localization: [],

      type:             row.type,
      isDigital:        row.isDigital,
      isOnlineOnly:     row.isOnlineOnly ?? null,
      isPaperOnly:      row.isPaperOnly ?? null,
      isForeignOnly:    row.isForeignOnly ?? null,
      isPartialPreview: row.isPartialPreview ?? null,
      isFoilOnly:       row.isFoilOnly,
      isNonfoilOnly:    row.isNonfoilOnly,
      symbolStyle:      row.symbolStyle ?? null,
      doubleFacedIcon:  row.doubleFacedIcon ?? null,
      keyruneCode:      row.keyruneCode ?? null,

      releaseDate: row.releaseDate ?? null,

      scryfallId:   row.scryfallId,
      scryfallCode: row.scryfallCode,

      mtgoCode:         row.mtgoCode ?? null,
      arenaCode:        row.arenaCode ?? null,
      tcgPlayerId:      row.tcgPlayerId ?? null,
      tcgplayerGroupId: row.tcgplayerGroupId ?? null,
      mcmId:            row.mcmId ?? null,
      mcmIdExtras:      row.mcmIdExtras ?? null,
      mcmName:          row.mcmName ?? null,
      cardsphereSetId:  row.cardsphereSetId ?? null,
      tokenSetCode:     row.tokenSetCode ?? null,

      boosters,
    };
  });

export const set = { detail };
