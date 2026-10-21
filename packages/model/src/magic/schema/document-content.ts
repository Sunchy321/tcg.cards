import z from 'zod';

export const documentOrigin = z.enum(['static', 'user']);
export const documentVisibility = z.enum(['public', 'unlisted', 'private']);
export const translationMethod = z.enum(['human', 'machine', 'machine_edited']);
export const reviewStatus = z.enum(['unreviewed', 'reviewed']);

export const documentSettings = z.strictObject({
  outline:       z.boolean().default(false),
  compare:       z.boolean().default(false),
  historyPublic: z.boolean().default(false),
  copyable:      z.boolean().default(false),
});

export const documentStatistics = z.strictObject({
  characterCount:    z.number().int().nonnegative(),
  wordCount:         z.number().int().nonnegative(),
  entryCount:        z.number().int().nonnegative(),
  chapterCount:      z.number().int().nonnegative().nullable(),
  ruleCount:         z.number().int().nonnegative().nullable(),
  exampleCount:      z.number().int().nonnegative().nullable(),
  termCount:         z.number().int().nonnegative().nullable(),
  calculatedAt:      z.iso.datetime(),
  calculatorVersion: z.string().min(1),
});

export const documentMeta = documentStatistics.partial();

/** Measures saved readable text independently of source-file bytes. */
export type DocumentStatistics = z.infer<typeof documentStatistics>;
/** Contains derived information without changing a revision's saved content. */
export type DocumentMeta = z.infer<typeof documentMeta>;

const range = { start: z.number().int().nonnegative(), end: z.number().int().positive() };

// Offsets address UTF-16 code units, matching JavaScript string slicing.
export const textMarker = z.discriminatedUnion('type', [
  z.strictObject({ ...range, type: z.literal('emphasis'), style: z.enum(['strong', 'emphasis', 'strike']) }),
  z.strictObject({ ...range, type: z.literal('link'), href: z.url() }),
  z.strictObject({ ...range, type: z.literal('card'), cardId: z.string().min(1) }),
  z.strictObject({
    ...range,
    type:       z.literal('chapter'),
    anchor:     z.string().min(1),
    documentId: z.string().optional(),
    releaseId:  z.string().optional(),
  }),
]).refine(marker => marker.end > marker.start, 'Marker end must follow its start');

export const sourceFile = z.strictObject({
  format:        z.enum(['txt', 'pdf', 'doc', 'docx']),
  language:      z.string().min(1),
  sourceUrl:     z.url().optional(),
  storageKey:    z.string().optional(),
  sha256:        z.string().regex(/^[a-f0-9]{64}$/).optional(),
  size:          z.number().int().nonnegative().optional(),
  translationId: z.string().optional(),
}).refine(file => file.sourceUrl != null || file.storageKey != null, 'A source URL or storage key is required');

/** Configure independent document capabilities. */
export type DocumentSettings = z.infer<typeof documentSettings>;
/** Annotate authoritative readable text without duplicating its characters. */
export type TextMarker = z.infer<typeof textMarker>;
/** Locate an original download associated with a public release. */
export type SourceFile = z.infer<typeof sourceFile>;
/** Distinguish build-owned and user-owned remote content. */
export type DocumentOrigin = z.infer<typeof documentOrigin>;
/** Control access to user-authored documents. */
export type DocumentVisibility = z.infer<typeof documentVisibility>;
/** Describe translation provenance independently of ingestion. */
export type TranslationMethod = z.infer<typeof translationMethod>;
/** Record review independently of translation provenance. */
export type ReviewStatus = z.infer<typeof reviewStatus>;
