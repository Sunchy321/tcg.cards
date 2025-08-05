import z from 'zod';

export const searchError = z.object({
    type:  z.string(),
    value: z.string().optional(),
    query: z.string().optional(),
});

export type SearchResultSchema<Z extends z.ZodType> = z.ZodObject<{
    text:   z.ZodOptional<z.ZodString>;
    result: z.ZodOptional<Z>;
    errors: z.ZodOptional<z.ZodArray<typeof searchError>>;
}>;

export type SearchResult<R> = {
    text?:   string;
    result?: R[];
    errors?: z.infer<typeof searchError>[];
};

export function createSearchResult<Z extends z.ZodType>(schema: Z): SearchResultSchema<Z> {
    return z.strictObject({
        text:   z.string().min(1).max(1000).optional(),
        result: schema.optional(),
        errors: searchError.array().optional(),
    });
}

export type SearchNormalResultSchema<Z extends z.ZodType> = z.ZodObject<{
    result:    z.ZodArray<Z>;
    total:     z.ZodNumber;
    totalPage: z.ZodNumber;
    page:      z.ZodNumber;
    elapsed:   z.ZodNumber;
}>;

export type SearchNormalResult<Z extends z.ZodType> = z.infer<SearchNormalResultSchema<Z>>;

export function createSearchNormalResult<Z extends z.ZodType>(schema: Z): SearchNormalResultSchema<Z> {
    return z.strictObject({
        result:    z.array(schema),
        total:     z.int().int().nonnegative(),
        totalPage: z.int().int().nonnegative(),
        page:      z.int().int().nonnegative(),
        elapsed:   z.int().int().nonnegative(),
    });
}

export const searchInput = z.object({
    q:        z.string().min(1).max(1000),
    page:     z.string().transform(v => Number.parseInt(v, 10) || 1).pipe(z.int().int().positive()),
    pageSize: z.string().transform(v => Number.parseInt(v, 10) || 100).pipe(z.int().int().positive()),
});
