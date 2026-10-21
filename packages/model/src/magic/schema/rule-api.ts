import z from 'zod';

import { documentMeta, sourceFile } from './document-content';

export const ruleIdentity = z.strictObject({
  id:             z.string(),
  title:          z.string(),
  sourceLanguage: z.string(),
});

export const ruleVersion = z.strictObject({
  versionTag:    z.string(),
  effectiveDate: z.string().nullable(),
  publishedAt:   z.iso.datetime(),
  languages:     z.array(z.string()),
});

// File storage keys are private implementation details, not download URLs.
const { storageKey: _storageKey, ...fileFields } = sourceFile.shape;
export const ruleFile = z.strictObject({ ...fileFields, downloadUrl: z.url().nullable() });

export const ruleMetadata = z.strictObject({
  ruleId:        z.string(),
  title:         z.string(),
  versionTag:    z.string(),
  revisionId:    z.string(),
  language:      z.string(),
  effectiveDate: z.string().nullable(),
  publishedAt:   z.iso.datetime(),
  meta:          documentMeta,
  files:         z.array(ruleFile),
});

/** Describes one published rulebook available to API clients. */
export type RuleIdentity = z.infer<typeof ruleIdentity>;
/** Describes a release and the languages explicitly selected for it. */
export type RuleVersion = z.infer<typeof ruleVersion>;
/** Exposes saved statistics and public file descriptors for one language revision. */
export type RuleMetadata = z.infer<typeof ruleMetadata>;
