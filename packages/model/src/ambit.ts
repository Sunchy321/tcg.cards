import { z } from 'zod';

/**
 * Card ambit (CONTEXT.md "card ambit", ADR 0015): the minimum ambit at which a
 * card enters the card pool and search. The ladder is cumulative —
 * primary ⊂ additional ⊂ full.
 */
export const ambit = z.enum([
  'primary',
  'additional',
  'full',
]).describe('ambit');

export type Ambit = z.infer<typeof ambit>;
