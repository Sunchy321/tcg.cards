import type { AnyD1Database, DrizzleD1Database } from 'drizzle-orm/d1';
import type * as MagicSearchSchema from '@tcg-cards/db/schema/sqlite/magic';

/** Accepts the native D1 binding consumed by Drizzle's D1 driver. */
export type MagicSearchD1Database = AnyD1Database;

/** Carries the Magic SQLite schema through Drizzle's D1 query builder. */
export type MagicSearchDrizzle = DrizzleD1Database<typeof MagicSearchSchema>;
