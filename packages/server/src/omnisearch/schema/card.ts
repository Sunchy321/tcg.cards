import { and, eq, sql } from 'drizzle-orm';

import { schema } from './schema';

import { Game } from '@model/schema';

import { CardView as MagicCardView } from '@/magic/schema/card';
// import { CardView as PTCGCardView } from '@/ptcg/schema/card';
import { CardView as YugiohCardView } from '@/yugioh/schema/card';
import { CardEntityView as HearthstoneCardView } from '@/hearthstone/schema/entity';
import { CardView as LorcanaCardView } from '@/lorcana/schema/card';

import { HearthstoneTypeLocalization } from './localization';

export const CardView = schema.materializedView('card_view').as(qb => {
    const magic = qb.select({
        game:     sql<Game>`'magic'`.as('game'),
        cardId:   MagicCardView.cardId,
        locale:   sql<string>`${MagicCardView.locale}::TEXT`.as('locale'),
        name:     MagicCardView.localization.name,
        typeline: MagicCardView.localization.typeline,
        text:     MagicCardView.localization.text,
    })
        .from(MagicCardView);

    const yugioh = qb.select({
        game:     sql<Game>`'yugioh'`.as('game'),
        cardId:   YugiohCardView.cardId,
        locale:   sql<string>`${YugiohCardView.lang}::TEXT`.as('locale'),
        name:     YugiohCardView.localization.name,
        typeline: YugiohCardView.localization.typeline,
        text:     YugiohCardView.localization.text,
    })
        .from(YugiohCardView);

    const hearthstone = qb.select({
        game:     sql<Game>`'hearthstone'`.as('game'),
        cardId:   HearthstoneCardView.cardId,
        locale:   sql<string>`${HearthstoneCardView.lang}::TEXT`.as('locale'),
        name:     HearthstoneCardView.localization.name,
        typeline: HearthstoneTypeLocalization.text,
        text:     HearthstoneCardView.localization.text,
    })
        .from(HearthstoneCardView)
        .where(eq(HearthstoneCardView.isLatest, true))
        .innerJoin(HearthstoneTypeLocalization, and(
            eq(HearthstoneTypeLocalization.type, HearthstoneCardView.type),
            eq(HearthstoneTypeLocalization.lang, HearthstoneCardView.lang),
        ));

    const lorcana = qb.select({
        game:     sql<Game>`'lorcana'`.as('game'),
        cardId:   LorcanaCardView.cardId,
        locale:   sql<string>`${LorcanaCardView.lang}::TEXT`.as('locale'),
        name:     LorcanaCardView.localization.name,
        typeline: LorcanaCardView.localization.typeline,
        text:     LorcanaCardView.localization.text,
    })
        .from(LorcanaCardView);

    return magic.union(yugioh).union(hearthstone).union(lorcana);
});
