import z from 'zod';

export const jsonPatch = z.object({
    op: z.enum([
        'add',
        'remove',
        'replace',
        'move',
        'copy',
        'test',
        '_get',
    ]),

    path: z.string(),

    value: z.any().optional(),
});
