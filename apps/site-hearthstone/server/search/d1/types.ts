import type { AnyD1Database, DrizzleD1Database } from 'drizzle-orm/d1';
import type * as SearchSchema from '@tcg-cards/db/schema/sqlite/hearthstone';

/** Accepts the native D1 binding consumed by Drizzle. */
export type HearthstoneSearchD1Database = AnyD1Database;

/** Carries the Hearthstone SQLite schema through the D1 query builder. */
export type SearchDrizzle = DrizzleD1Database<typeof SearchSchema>;
