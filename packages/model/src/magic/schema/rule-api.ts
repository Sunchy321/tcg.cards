import z from 'zod';

import { documentMeta, sourceFile, textMarker } from './document-content';
import { nodeKind } from './document';

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

export const ruleNode = z.strictObject({
  nodeKey:      z.string(),
  kind:         nodeKind,
  anchor:       z.string().nullable(),
  path:         z.string(),
  level:        z.number().int().nonnegative(),
  parentKey:    z.string().nullable(),
  siblingOrder: z.number().int().nonnegative(),
  order:        z.number().int().nonnegative(),
  rawText:      z.string(),
  markers:      textMarker.array(),
});

export const ruleContent = ruleMetadata.pick({
  ruleId: true, title: true, versionTag: true, revisionId: true, language: true, effectiveDate: true, publishedAt: true,
}).extend({ nodes: ruleNode.array() });

/** Returns one selected language's saved text in source document order. */
export type RuleContent = z.infer<typeof ruleContent>;

/** Describes one published rulebook available to API clients. */
export type RuleIdentity = z.infer<typeof ruleIdentity>;
/** Describes a release and the languages explicitly selected for it. */
export type RuleVersion = z.infer<typeof ruleVersion>;
/** Exposes saved statistics and public file descriptors for one language revision. */
export type RuleMetadata = z.infer<typeof ruleMetadata>;
