import { z } from 'zod';
import { and, asc, count, eq, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm';

import { NameRuby } from '@tcg-cards/db/schema/local/magic';
import { PrintPart } from '@tcg-cards/db/schema/shared/magic/print';

import { os } from './index';
import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';
import { loadNameRubyLookup } from '../lib/magic/name-ruby';
import { applyNameRuby, type NameRubyLocale } from '../lib/magic/name-ruby-write';
import { storedFacePreview } from '../lib/magic/image-import/common';
import { normalizeRubyParens, validateNameRuby } from '@tcg-cards/model/magic/name-ruby';

const rubyKind = z.enum(['name', 'flavor_name']);
const rubyStatus = z.enum(['draft', 'reviewed']);

const rubyRow = z.strictObject({
  lang:       z.string(),
  kind:       rubyKind,
  name:       z.string(),
  rubyName:   z.string(),
  exceptions: z.record(z.string(), z.string()).nullable(),
  source:     z.string(),
  status:     rubyStatus,
  updatedAt:  z.string(),
});

const writeCounts = z.strictObject({
  prints:       z.number(),
  printParts:   z.number(),
  cardLocs:     z.number(),
  cardPartLocs: z.number(),
});

const exceptionEntry = z.strictObject({
  key:      z.string(),
  rubyName: z.string(),
});

const rubyEntry = rubyRow.extend({
  exceptionsList: z.array(exceptionEntry),
});

/** Deep-links a reading to the site: one representative card page per reading. */
const rubyTarget = z.strictObject({
  cardId: z.string(),
  set:    z.string(),
  number: z.string(),
  partIndex: z.number(),
});

const list = os
  .input(z.strictObject({
    status:   rubyStatus.optional(),
    source:   z.string().optional(),
    kind:     rubyKind.optional(),
    search:   z.string().optional(),
    page:     z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(200).default(50),
  }))
  .output(z.strictObject({
    items:  z.array(rubyEntry),
    total:  z.number(),
    counts: z.strictObject({
      draft:    z.number(),
      reviewed: z.number(),
      bySource: z.array(z.strictObject({ source: z.string(), status: rubyStatus, count: z.number() })),
    }),
  }))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const filters: SQL[] = [isNull(NameRuby.deletedAt)];
    if (input.status != null) filters.push(eq(NameRuby.status, input.status));
    if (input.source != null) filters.push(eq(NameRuby.source, input.source));
    if (input.kind != null) filters.push(eq(NameRuby.kind, input.kind));
    if (input.search != null && input.search.trim() !== '') {
      const term = `%${input.search.trim()}%`;
      filters.push(or(ilike(NameRuby.name, term), ilike(NameRuby.rubyName, term))!);
    }
    const where = and(...filters);

    const rows = await db.select().from(NameRuby).where(where)
      .orderBy(asc(NameRuby.name))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);

    const [totalRow] = await db.select({ n: count() }).from(NameRuby).where(where);
    const statusRows = await db.select({ status: NameRuby.status, n: count() }).from(NameRuby)
      .where(isNull(NameRuby.deletedAt)).groupBy(NameRuby.status);
    const sourceRows = await db.select({ source: NameRuby.source, status: NameRuby.status, n: count() }).from(NameRuby)
      .where(isNull(NameRuby.deletedAt)).groupBy(NameRuby.source, NameRuby.status);

    return {
      items: rows.map(row => ({
        lang:           row.lang,
        kind:           row.kind,
        name:           row.name,
        rubyName:       row.rubyName,
        exceptions:     row.exceptions ?? null,
        source:         row.source,
        status:         row.status,
        updatedAt:      row.updatedAt.toISOString(),
        exceptionsList: Object.entries(row.exceptions ?? {}).map(([key, rubyName]) => ({ key, rubyName })),
      })),
      total: Number(totalRow?.n ?? 0),
      counts: {
        draft:    Number(statusRows.find(r => r.status === 'draft')?.n ?? 0),
        reviewed: Number(statusRows.find(r => r.status === 'reviewed')?.n ?? 0),
        bySource: sourceRows.map(r => ({ source: r.source, status: r.status, count: Number(r.n) })),
      },
    };
  });

const promote = os
  .input(z.strictObject({
    // Exactly one selector, so a mis-click cannot promote the whole table.
    source: z.string().optional(),
    names:  z.array(z.strictObject({ lang: z.string(), kind: rubyKind, name: z.string() })).optional(),
    search: z.string().optional(),
  }))
  .output(z.strictObject({
    promoted: z.number(),
    written:  writeCounts,
  }))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const filters: SQL[] = [isNull(NameRuby.deletedAt), eq(NameRuby.status, 'draft')];
    if (input.names != null && input.names.length > 0) {
      filters.push(or(...input.names.map(n => and(
        eq(NameRuby.lang, n.lang as never), eq(NameRuby.kind, n.kind), eq(NameRuby.name, n.name),
      )))!);
    } else if (input.source != null) {
      filters.push(eq(NameRuby.source, input.source));
    } else if (input.search != null && input.search.trim() !== '') {
      const term = `%${input.search.trim()}%`;
      filters.push(or(ilike(NameRuby.name, term), ilike(NameRuby.rubyName, term))!);
    } else {
      throw new Error('promote requires a source, a name list, or a search term');
    }

    const targets = await db.select({
      lang: NameRuby.lang, kind: NameRuby.kind, name: NameRuby.name,
    }).from(NameRuby).where(and(...filters));

    if (targets.length > 0) {
      await db.update(NameRuby).set({ status: 'reviewed' }).where(and(...filters));
    }

    // The authority is the source of the annotation, so the write-through runs
    // against the freshly promoted readings — a promotion is visible without a
    // projection run.
    const lookup = await loadNameRubyLookup(db);
    const written = await applyNameRuby(db, lookup, targets.map(t => ({
      lang: t.lang, kind: t.kind, name: t.name,
    })));

    return { promoted: targets.length, written };
  });

const update = os
  .input(z.strictObject({
    lang:       z.string(),
    kind:       rubyKind,
    name:       z.string(),
    rubyName:   z.string().nullable(),
    exceptions: z.array(exceptionEntry).nullable().optional(),
    status:     rubyStatus.optional(),
  }))
  .output(z.strictObject({
    saved:   z.boolean(),
    written: writeCounts,
  }))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const current = await db.select().from(NameRuby).where(and(
      eq(NameRuby.lang, input.lang as never),
      eq(NameRuby.kind, input.kind),
      eq(NameRuby.name, input.name),
      isNull(NameRuby.deletedAt),
    )).then(rows => rows[0]);

    // An edit is validated before it is stored: a reading that does not rebuild
    // the name is rejected rather than saved and silently dropped downstream.
    const rubyName = input.rubyName == null ? null : validateNameRuby(input.name, normalizeRubyParens(input.rubyName));
    if (input.rubyName != null && rubyName == null) {
      throw new Error('注音校验失败：基底须与名称逐字一致，读音须为假名');
    }
    const exceptions: Record<string, string> = {};
    for (const entry of input.exceptions ?? []) {
      const validated = validateNameRuby(input.name, normalizeRubyParens(entry.rubyName));
      if (validated == null) {
        throw new Error(`例外 ${entry.key} 校验失败：基底须与名称逐字一致，读音须为假名`);
      }
      exceptions[entry.key] = validated;
    }

    const values = {
      rubyName:   rubyName ?? '',
      exceptions: Object.keys(exceptions).length > 0 ? exceptions : null,
      ...(input.status != null ? { status: input.status } : {}),
    };

    if (current == null) {
      await db.insert(NameRuby).values({
        lang: input.lang as never,
        kind: input.kind,
        name: input.name,
        ...values,
        source: 'manual',
        status: input.status ?? 'reviewed',
      });
    } else {
      await db.update(NameRuby).set(values).where(and(
        eq(NameRuby.lang, input.lang as never),
        eq(NameRuby.kind, input.kind),
        eq(NameRuby.name, input.name),
      ));
    }

    const lookup = await loadNameRubyLookup(db);
    const written = await applyNameRuby(db, lookup, [{
      lang: input.lang as never, kind: input.kind, name: input.name,
    }]);
    return { saved: true, written };
  });

/** One representative card page per reading, so the console can deep-link a row. */
const targets = os
  .input(z.strictObject({
    keys: z.array(z.strictObject({ lang: z.string(), kind: rubyKind, name: z.string() })).min(1).max(300),
  }))
  .output(z.record(z.string(), rubyTarget))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const names = [...new Set(input.keys.map(k => k.name))];
    const langs = [...new Set(input.keys.map(k => k.lang))] as NameRubyLocale[];
    const rows = await db.select({
      lang:      PrintPart.lang,
      name:      PrintPart.name,
      cardId:    PrintPart.cardId,
      set:       PrintPart.set,
      number:    PrintPart.number,
      partIndex: PrintPart.partIndex,
    }).from(PrintPart).where(and(
      inArray(PrintPart.lang, langs),
      inArray(PrintPart.name, names),
      isNull(PrintPart.deletedAt),
    ));

    const out: Record<string, z.infer<typeof rubyTarget>> = {};
    for (const row of rows) {
      const key = `${row.lang}\u0000name\u0000${row.name}`;
      if (out[key] == null) {
        out[key] = { cardId: row.cardId, set: row.set, number: row.number, partIndex: row.partIndex };
      }
    }
    return out;
  });

/**
 * Card images for the review rows: the reviewer checks a reading against the
 * printed card, so each row needs its stored image. Batched and downscaled —
 * the console loads a page of thumbnails in one call, and a face without a
 * stored image simply comes back without one.
 */
const previews = os
  .input(z.strictObject({
    targets: z.array(z.strictObject({
      set:       z.string(),
      lang:      z.string(),
      number:    z.string(),
      partIndex: z.number().int().min(0),
    })).max(60),
  }))
  .output(z.record(z.string(), z.string()))
  .handler(async ({ input }) => {
    const out: Record<string, string> = {};
    for (const target of input.targets) {
      const key = `${target.set}\u0000${target.lang}\u0000${target.number}\u0000${target.partIndex}`;
      const preview = await storedFacePreview(target.set, target.lang, target.number, target.partIndex);
      if (preview != null) out[key] = preview;
    }
    return out;
  });

export const magicRubyRouter = {
  list,
  promote,
  update,
  targets,
  previews,
};
