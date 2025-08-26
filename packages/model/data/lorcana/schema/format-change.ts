import { z } from 'zod';

export const legality = z.enum(['banned', 'legal', 'unavailable']);

export const banlist = z.record(z.string(), legality);

export const formatAnnouncement = z.strictObject({
    source:        z.string(),
    date:          z.string(),
    effectiveDate: z.string().optional(),
    link:          z.array(z.string()).optional(),

    changes: z.array(
        z.strictObject({
            format:  z.string(),
            setIn:   z.array(z.string()).optional(),
            setOut:  z.array(z.string()).optional(),
            banlist: z
                .array(
                    z.strictObject({
                        id:     z.string(),
                        status: legality,
                    }),
                )
                .optional(),
        }),
    ),
});

export const formatChange = z.strictObject({
    source: z.string(),
    date:   z.string(),
    format: z.string(),
    link:   z.array(z.string()).optional(),
    type:   z.enum(['card', 'set']),
    id:     z.string(),
    status: z.enum(['banned', 'legal', 'unavailable', 'in', 'out']),
    group:  z.string().optional(),
});

export type Legality = z.infer<typeof legality>;
export type Banlist = z.infer<typeof banlist>;
export type FormatAnnouncement = z.infer<typeof formatAnnouncement>;
export type FormatChange = z.infer<typeof formatChange>;
