import { oc } from '@orpc/contract';

import z from 'zod';

/** Generate a catalog contract returning a fixed enum/array. */
export function defineCatalogContract(config: {
  tags: string[];
}) {
  return oc
    .route({ method: 'GET', tags: config.tags })
    .output(z.string().array());
}

/** Generate a fact-table contract querying by primary key. */
export function defineFactTableContract<T extends Record<string, { schema: z.ZodTypeAny }>>(config: {
  tags:   string[];
  pk:     T;
  output: z.ZodTypeAny;
}) {
  const shape = Object.fromEntries(
    Object.entries(config.pk).map(([key, field]) => [key, field.schema]),
  ) as { [K in keyof T]: T[K]['schema'] };

  const input = z.object(shape);

  return oc
    .route({ method: 'GET', tags: config.tags })
    .input(input)
    .output(config.output);
}
