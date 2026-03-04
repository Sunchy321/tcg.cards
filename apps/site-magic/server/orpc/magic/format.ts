import { ORPCError, os } from '@orpc/server';

import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';

import { format as formatSchema } from '#model/magic/schema/format';
import { formatChange as formatChangeSchema } from '#model/magic/schema/game-change';

import { db } from '#server/db/db';
import { Format } from '#schema/magic/format';
import { FormatChange } from '#schema/magic/game-change';

const list = os
  .route({
    method:      'GET',
    description: 'Get list of formats',
    tags:        ['Magic', 'Format'],
  })
  .input(z.any())
  .output(z.string().array())
  .handler(async () => {
    const formats = await db.select({ formatId: Format.formatId })
      .from(Format);

    return formats.map(f => f.formatId);
  });

const full = os
  .route({
    method:      'GET',
    description: 'Get full format info',
    tags:        ['Magic', 'Format'],
  })
  .input(z.object({ formatId: z.string() }))
  .output(formatSchema)
  .handler(async ({ input }) => {
    const { formatId } = input;

    const fmt = await db.select()
      .from(Format)
      .where(eq(Format.formatId, formatId))
      .then(rows => rows[0]);

    if (fmt == null) {
      throw new ORPCError('NOT_FOUND');
    }

    return {
      formatId:     fmt.formatId,
      localization: fmt.localization,
      sets:         fmt.sets,
      banlist:      fmt.banlist,
      birthday:     fmt.birthday ?? null,
      deathdate:    fmt.deathdate ?? null,
      tags:         fmt.tags,
    };
  });

const changes = os
  .route({
    method:      'GET',
    description: 'Get format changes ordered by date',
    tags:        ['Magic', 'Format'],
  })
  .input(z.object({ formatId: z.string() }))
  .output(formatChangeSchema.array())
  .handler(async ({ input }) => {
    const { formatId } = input;

    const records = await db.select()
      .from(FormatChange)
      .where(eq(FormatChange.format, formatId))
      .orderBy(asc(FormatChange.date));

    return records.map(r => ({
      source:        r.source,
      date:          r.date,
      effectiveDate: r.effectiveDate ?? null,
      name:          r.name,
      link:          r.link,
      type:          r.type,
      format:        r.format ?? null,
      cardId:        r.cardId ?? null,
      setId:         r.setId ?? null,
      ruleId:        r.ruleId ?? null,
      group:         r.group ?? null,
      status:        r.status ?? null,
      score:         r.score ?? null,
      adjustment:    r.adjustment ?? null,
    }));
  });

export const formatTrpc = {
  list,
  full,
  changes,
};

export const formatApi = {
  '': full,
  list,
  changes,
};
