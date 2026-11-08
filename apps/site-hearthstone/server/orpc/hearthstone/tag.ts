import { os } from '@orpc/server';
import { and, eq, inArray, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm';

import { db } from '#db/db';
import { Tag } from '#schema/shared/hearthstone/tag';
import {
  tagCatalogInput,
  tagCatalogProjection,
  tagCatalogResult,
  type TagCatalogInput,
  type TagCatalogProjection,
} from '~~/shared/tag-catalog';

const projectKinds = {
  field:     ['assign_value', 'append_string_array', 'assign_card_ref', 'assign_legacy'],
  mechanic:  ['assign_mechanic'],
  relation:  ['emit_relation'],
  localized: ['assign_localized_text'],
  none:      ['none'],
} satisfies Record<TagCatalogProjection, string[]>;

// These fields also generate relations when a card reference resolves.
const relationFields = ['heroPower', 'tripleCard', 'buddy'];

const relationPredicate = or(
  eq(Tag.projectKind, 'emit_relation'),
  and(eq(Tag.projectKind, 'assign_card_ref'), inArray(Tag.projectTargetPath, relationFields)),
);

/** Matches a display category, including relations derived from card fields. */
function projectionFilter(projection: TagCatalogProjection) {
  return projection === 'relation' ? relationPredicate : inArray(Tag.projectKind, projectKinds[projection]);
}

/** Normalizes separators in both names and slugs for search. */
function normalized(column: SQLWrapper) {
  return sql`regexp_replace(lower(${column}), '[-_[:space:]]+', '-', 'g')`;
}

/** Searches by exact numeric ID or by canonical slug, name, and their aliases. */
function searchTags(query: string, name: SQL) {
  const id = /^#?(-?\d+)$/.exec(query)?.[1];
  if (id != null) {
    const numericId = Number(id);
    return numericId >= -2147483648 && numericId <= 2147483647
      ? { filter: eq(Tag.enumId, numericId) }
      : { filter: sql`false` };
  }

  const term = query.toLowerCase().replace(/[-_\s]+/g, '-');
  const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
  const slug = normalized(Tag.slug);

  return {
    filter: or(
      sql`${slug} like ${pattern}`,
      sql`${normalized(name)} like ${pattern}`,
      sql`exists (
        select 1 from unnest(${Tag.slugAliases} || ${Tag.rawNames}) as alias(name)
        where ${normalized(sql`alias.name`)} like ${pattern}
      )`,
    ),
    order: sql`case when ${slug} = ${term} then 0 else 1 end`,
  };
}

/** Lists public tag copy and both classifications without exposing import configuration. */
async function listTags(input: TagCatalogInput) {
  const name = sql<string | null>`coalesce(
    ${Tag.localization} -> ${input.lang}::text ->> 'name',
    ${Tag.localization} -> 'en' ->> 'name',
    ${Tag.rawName}
  )`;
  const description = sql<string | null>`coalesce(
    ${Tag.localization} -> ${input.lang}::text ->> 'description',
    ${Tag.localization} -> 'en' ->> 'description'
  )`;
  const search = input.q ? searchTags(input.q, name) : undefined;
  const where = and(
    search?.filter,
    or(...input.projection.map(projectionFilter)),
    input.valueType.length ? inArray(Tag.valueType, input.valueType) : undefined,
  );

  // Read counts and rows from one snapshot so the last page agrees with its count.
  return db.transaction(async tx => {
    const total = await tx.$count(Tag, where);
    const pageSize = input.pageSize;
    const page = Math.min(input.page, Math.max(1, Math.ceil(total / pageSize)));
    const rows = await tx.select({
      enumId:      Tag.enumId,
      slug:        Tag.slug,
      name,
      description,
      projectKind: Tag.projectKind,
      hasRelation: sql<boolean>`coalesce(${relationPredicate}, false)`,
      valueType:   Tag.valueType,
    })
      .from(Tag)
      .where(where)
      .orderBy(...(search?.order == null ? [Tag.enumId] : [search.order, Tag.enumId]))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      items: rows.map(({ projectKind, hasRelation, ...row }) => ({
        ...row,
        projections: tagCatalogProjection.options.filter(projection =>
          projection === 'relation' ? hasRelation : projectKind != null && projectKinds[projection].includes(projectKind),
        ),
      })),
      total,
      catalogTotal: where == null ? total : await tx.$count(Tag),
      page,
      pageSize,
    };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}

export const tagTrpc = {
  list: os.input(tagCatalogInput).output(tagCatalogResult).handler(({ input }) => listTags(input)),
};
