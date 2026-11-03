import { and, eq, getColumns, isNull, sql } from 'drizzle-orm';
import type { createDb } from '@tcg-cards/db';
import { SearchCard, SearchCardLocalization } from '@tcg-cards/db/schema/shared/hearthstone/search';
import { essentialCardSearchItem } from '@tcg-cards/model/hearthstone/schema/search';

import type { SnapshotItem } from './hearthstone-d1-snapshot';

/** Accepts the existing PostgreSQL database or one of its read-only transactions. */
type SourceDb = Pick<ReturnType<typeof createDb>, 'select'>;

/** Reads source-collected sort ranks together with list facts in the same PostgreSQL statement. */
export function projectedSearchQuery(db: SourceDb) {
  const {
    createdAt: _created,
    updatedAt: _updated,
    deletedAt: _deleted,
    ...columns
  } = getColumns(SearchCard);
  const pairs = Object.entries(columns).flatMap(([key, column]) => [
    sql`${key}::text`,
    sql`${column}`,
  ]);
  return db
    .select({
      // Dense ranks preserve ties so later sort components still break them in the original order.
      item: sql<SnapshotItem>`jsonb_build_object(${sql.join(pairs, sql`, `)},
      'idOrder', dense_rank() over (order by ${SearchCard.cardId}),
      'setOrder', dense_rank() over (order by ${SearchCard.set}),
      'nameOrder', dense_rank() over (order by ${SearchCardLocalization.name}),
      'lang', ${SearchCardLocalization.lang},
      'renderHash', ${SearchCardLocalization.renderHash},
      'localization', jsonb_build_object('name', ${SearchCardLocalization.name}, 'text', ${SearchCardLocalization.text}))`.as(
        'item',
      ),
    })
    .from(SearchCard)
    .innerJoin(SearchCardLocalization, eq(SearchCard.cardId, SearchCardLocalization.cardId))
    .where(and(isNull(SearchCard.deletedAt), isNull(SearchCardLocalization.deletedAt)))
    .orderBy(SearchCard.cardId, SearchCardLocalization.lang);
}

/** Validates source facts separately from their internal numeric collation keys. */
export function snapshotRows(rows: Array<{ item: SnapshotItem }>): SnapshotItem[] {
  return rows.map(({ item: raw }) => {
    const { idOrder, setOrder, nameOrder, ...item } = raw;
    return { ...essentialCardSearchItem.parse(item), idOrder, setOrder, nameOrder };
  });
}
