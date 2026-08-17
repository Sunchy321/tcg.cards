import {
  bigint,
  check,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { schema } from './schema';

/** Exportable Yu-Gi-Oh! card facts produced by the desktop import workflow. */
export const Card = schema.table('cards', {
  id: bigint('id', { mode: 'number' })
    .primaryKey()
    .generatedByDefaultAsIdentity({ name: 'yugioh_cards_id_seq' }),

  cid:      bigint('cid', { mode: 'number' }),
  password: varchar('password', { length: 8 }),

  cnName:      text('cn_name'),
  scName:      text('sc_name'),
  mdName:      text('md_name'),
  nwbbsName:   text('nwbbs_name'),
  cnocgName:   text('cnocg_name'),
  jpRuby:      text('jp_ruby'),
  jpName:      text('jp_name'),
  enName:      text('en_name'),
  mdEnName:    text('md_en_name'),
  wikiEnName:  text('wiki_en_name'),
  setExt:      text('set_ext'),

  typesText:            text('types_text'),
  pendulumDescription:  text('pendulum_description'),
  description:          text('description'),

  ot:        integer('ot'),
  setcode:   bigint('setcode', { mode: 'bigint' }),
  type:      bigint('type', { mode: 'number' }),
  attack:    integer('attack'),
  defense:   integer('defense'),
  level:     integer('level'),
  race:      bigint('race', { mode: 'number' }),
  attribute: bigint('attribute', { mode: 'number' }),

  primaryImageR2Bucket:   text('primary_image_r2_bucket'),
  primaryImageR2Key:      text('primary_image_r2_key'),
  primaryImageContentType: text('primary_image_content_type'),
  primaryImageByteSize:   integer('primary_image_byte_size'),
  primaryImageWidth:      integer('primary_image_width'),
  primaryImageHeight:     integer('primary_image_height'),
  primaryImageSha256:     varchar('primary_image_sha256', { length: 64 }),
  primaryImageDeletedAt:  timestamp('primary_image_deleted_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, table => [
  uniqueIndex('cards_cid_uidx').on(table.cid),
  uniqueIndex('cards_password_uidx').on(table.password),
  uniqueIndex('cards_primary_image_r2_key_uidx').on(table.primaryImageR2Key),
  index('cards_deleted_at_idx').on(table.deletedAt),
  index('cards_primary_image_deleted_at_idx').on(table.primaryImageDeletedAt),
  check('cards_cid_positive_chk', sql`${table.cid} is null or ${table.cid} > 0`),
  check('cards_password_format_chk', sql`${table.password} is null or ${table.password} ~ '^[0-9]{8}$'`),
  check('cards_primary_image_sha256_format_chk', sql`${table.primaryImageSha256} is null or ${table.primaryImageSha256} ~ '^[a-f0-9]{64}$'`),
  check('cards_primary_image_byte_size_positive_chk', sql`${table.primaryImageByteSize} is null or ${table.primaryImageByteSize} > 0`),
  check('cards_primary_image_width_positive_chk', sql`${table.primaryImageWidth} is null or ${table.primaryImageWidth} > 0`),
  check('cards_primary_image_height_positive_chk', sql`${table.primaryImageHeight} is null or ${table.primaryImageHeight} > 0`),
  check('cards_primary_image_fields_complete_chk', sql`
    (${table.primaryImageR2Key} is null
      and ${table.primaryImageR2Bucket} is null
      and ${table.primaryImageContentType} is null
      and ${table.primaryImageByteSize} is null
      and ${table.primaryImageWidth} is null
      and ${table.primaryImageHeight} is null
      and ${table.primaryImageSha256} is null)
    or
    (${table.primaryImageR2Key} is not null
      and ${table.primaryImageR2Bucket} is not null
      and ${table.primaryImageContentType} is not null
      and ${table.primaryImageByteSize} is not null
      and ${table.primaryImageWidth} is not null
      and ${table.primaryImageHeight} is not null
      and ${table.primaryImageSha256} is not null)
  `),
]);
