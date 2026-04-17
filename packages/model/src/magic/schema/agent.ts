import { z } from 'zod';

// ---------------------------------------------------------------------------
// P0.4 — Embedding defaults
// ---------------------------------------------------------------------------

export const EMBEDDING_MODEL      = '@cf/baai/bge-m3';
export const EMBEDDING_DIMENSIONS = 1024;
export const EMBEDDING_DISTANCE   = 'cosine' as const;
export const QUERY_TIMEOUT_MS     = 1500;
export const DOCUMENT_TIMEOUT_MS  = 15000;
export const DOCUMENT_MAX_RETRIES = 3;

export const embeddingConfig = z.strictObject({
  model:      z.string().default(EMBEDDING_MODEL),
  dimensions: z.int().default(EMBEDDING_DIMENSIONS),
  distance:   z.enum(['cosine', 'l2', 'inner_product']).default(EMBEDDING_DISTANCE),
});

export type EmbeddingConfig = z.infer<typeof embeddingConfig>;

// ---------------------------------------------------------------------------
// P0.3 — Evidence model
// ---------------------------------------------------------------------------

// Source types that the agent can reference as evidence
export const sourceType = z.enum([
  'card',
  'ruling',
  'document_node',
  'card_relation',
  'format',
  'set',
  'announcement',
  'game_change',
]);

export type SourceType = z.infer<typeof sourceType>;

// A single piece of evidence backing an agent answer
export const evidenceItem = z.strictObject({
  sourceType,
  sourceKey:  z.string(),
  versionKey: z.string().nullable(),
  locale:     z.string(),
  snippet:    z.string(),
  citation:   z.string(),
  score:      z.number().min(0).max(1),
});

export type EvidenceItem = z.infer<typeof evidenceItem>;

// A bundle of evidence items attached to an agent response
export const evidenceBundle = z.strictObject({
  items: z.array(evidenceItem),
});

export type EvidenceBundle = z.infer<typeof evidenceBundle>;

// ---------------------------------------------------------------------------
// P0.5 — Tool return contract
// ---------------------------------------------------------------------------

// Every agent tool must return this structure
export const toolResult = z.strictObject({
  data:     z.unknown(),
  evidence: evidenceBundle,
});

export type ToolResult = z.infer<typeof toolResult>;

// Typed helper — use toolResultOf(cardView) to get a narrowed ToolResult
export function toolResultOf<T extends z.ZodType>(dataSchema: T) {
  return z.strictObject({
    data:     dataSchema,
    evidence: evidenceBundle,
  });
}
