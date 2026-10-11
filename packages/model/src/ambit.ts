import { z } from 'zod';

import { AMBITS } from '@tcg-cards/base';

export type { Ambit } from '@tcg-cards/base';

/**
 * Card ambit (CONTEXT.md "card ambit", ADR 0015): the minimum ambit at which a
 * card enters the card pool and search. The ladder is cumulative —
 * primary ⊂ additional ⊂ full. The value array is the universal ladder from
 * @tcg-cards/base; this model enum is its schema-facing form behind the
 * database column.
 */
export const ambit = z.enum(AMBITS).describe('ambit');
