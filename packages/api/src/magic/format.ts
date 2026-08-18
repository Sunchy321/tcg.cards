import { os } from '@orpc/server';

import { z } from 'zod';

import { defineFactTable } from '../factory';

import { db } from '@tcg-cards/db';
import { Format } from '@tcg-cards/db/schema/shared/magic/format';
import { format as formatSchema } from '@tcg-cards/model/src/magic/schema/format';

export const list = os
  .route({
    method:      'GET',
    description: 'Get list of formats',
    tags:        ['Magic', 'Format'],
  })
  .output(z.string().array())
  .handler(async () => {
    const formats = await db.select({ formatId: Format.formatId }).from(Format);

    return formats.map(f => f.formatId);
  });

export const full = defineFactTable({
  description: 'Get full format info',
  tags:        ['Magic', 'Format'],
  table:       Format,
  pk:          { formatId: { column: Format.formatId, schema: z.string() } },
  output:      formatSchema,
  map:         row => {
    const fmt = row as {
      formatId: string; localization: unknown; sets: unknown; banlist: unknown;
      birthday: string | null; deathdate: string | null; tags: unknown;
    };

    return {
      formatId:     fmt.formatId,
      localization: fmt.localization,
      sets:         fmt.sets,
      banlist:      fmt.banlist,
      birthday:     fmt.birthday ?? null,
      deathdate:    fmt.deathdate ?? null,
      tags:         fmt.tags,
    };
  },
});

export const formatRouter = { list, full };
