import z from 'zod';

/**
 * Schema for atomic_zhs.json (JSONL format)
 * Simplified Chinese localization data from MTGCH
 */
export const atomicZhs = z.strictObject({
    // Core identification
    oracle_id:        z.uuid(),
    name:             z.string(),
    released_at:      z.string(),
    set:              z.string(),
    collector_number: z.string(),

    // English text data
    type_line:       z.string(),
    oracle_text:     z.string(),
    text_updated_at: z.string(),

    // Official Chinese translation
    official_name:       z.string().nullable(),
    official_text:       z.string().nullable(),
    official_updated_at: z.string().nullable(),

    // Community translation
    translated_name:      z.string().nullable(),
    name_translated_at:   z.string().nullable(),
    name_translated_from: z.string().nullable(),
    translated_type:      z.string().nullable(),
    translated_text:      z.string().nullable(),
    text_translated_at:   z.string().nullable(),
    text_translated_from: z.string().nullable(),

    // Extra data
    extra: z.any().nullable(),
});

export type AtomicZhs = z.infer<typeof atomicZhs>;
