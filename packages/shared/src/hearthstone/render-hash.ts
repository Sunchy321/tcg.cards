import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import type { RenderModel } from '@tcg-cards/model/hearthstone/schema/entity';

/** Computes the canonical render hash for a render model (glow included when present). */
export function computeRenderHash(model: RenderModel): string {
  return createHash('sha256').update(canonicalize(model)!).digest('hex');
}
