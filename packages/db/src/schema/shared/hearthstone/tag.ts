import {
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { schema } from './schema';

type JsonMap = Record<string, unknown>;

export const Tag = schema.table('tags', {
  enumId: integer('enum_id').primaryKey(),

  slug:        text('slug').notNull(),
  slugAliases: text('slug_aliases').array().notNull().default([]),

  name:     text('name'),
  rawName:  text('raw_name'),
  rawType:  text('raw_type'),
  rawNames: text('raw_names').array().notNull().default([]),

  valueKind:       text('value_kind').notNull().default('json'),
  normalizeKind:   text('normalize_kind').notNull().default('identity'),
  normalizeConfig: jsonb('normalize_config')
    .$type<JsonMap>()
    .notNull()
    .default({}),

  projectTargetType: text('project_target_type'),
  projectTargetPath: text('project_target_path'),
  projectKind:       text('project_kind'),
  projectConfig:     jsonb('project_config')
    .$type<JsonMap>()
    .notNull()
    .default({}),

  status:      text('status').notNull().default('discovered'),
  description: text('description'),

  firstSeenSourceTag: integer('first_seen_source_tag'),
  lastSeenSourceTag:  integer('last_seen_source_tag'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  uniqueIndex('tags_slug_uq').on(table.slug),
  index('tags_status_idx').on(table.status),
  index('tags_target_path_idx').on(table.projectTargetType, table.projectTargetPath),
  index('tags_first_seen_idx').on(table.firstSeenSourceTag),
  index('tags_last_seen_idx').on(table.lastSeenSourceTag),
]);
