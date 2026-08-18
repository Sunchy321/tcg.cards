import { ORPCError } from '@orpc/server';

import z from 'zod';
import { and, eq } from 'drizzle-orm';

import { os } from './orpc';
import { db } from '@tcg-cards/db';

/** Generate a catalog endpoint returning a fixed enum/array. */
export function defineConstants(config: {
  description: string;
  tags:        string[];
  values:      readonly string[];
}) {
  return os
    .route({ method: 'GET', description: config.description, tags: config.tags })
    .output(z.string().array())
    .handler(async () => [...config.values]);
}

/** Generate a fact-table endpoint querying by primary key; returns the row directly when it matches the output schema, otherwise reshapes via map. */
export function defineFactTable(config: {
  description: string;
  tags:        string[];
  table:       unknown;
  pk:          Record<string, { column: unknown, schema: z.ZodTypeAny }>;
  output:      z.ZodTypeAny;
  map?:        (row: unknown) => unknown;
}) {
  const input = z.object(
    Object.fromEntries(Object.entries(config.pk).map(([key, field]) => [key, field.schema])),
  );

  return os
    .route({ method: 'GET', description: config.description, tags: config.tags })
    .input(input)
    .output(config.output)
    .handler(async ({ input }) => {
      const filters = Object.entries(config.pk).map(([key, field]) =>
        eq(field.column as never, (input as Record<string, unknown>)[key] as never),
      );

      const row = await db.select()
        .from(config.table as never)
        .where(and(...filters))
        .then(rows => rows[0]);

      if (row == null) {
        throw new ORPCError('NOT_FOUND');
      }

      return config.map ? config.map(row) : row;
    });
}
