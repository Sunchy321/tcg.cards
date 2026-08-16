import { index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const UserConfig = pgTable('user_configs', {
  userId:    text('user_id').notNull(),
  gameId:    text('game_id').notNull(),
  config:    jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  primaryKey({ columns: [table.userId, table.gameId] }),
  index('user_configs_user_id_idx').on(table.userId),
]);
