import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import type { Expression } from '#search/parser';

// The ladder itself is the single-source value array in @tcg-cards/base; this
// module re-exports it and layers the search-DSL machinery on top.
import { AMBITS, toAmbit, type Ambit } from '@tcg-cards/base';

export { AMBITS, toAmbit, type Ambit };

/** The DSL name of the universal ambit command (no sigil, no aliases, ADR 0015). */
export const ambitCommandName = 'ambit';

/** How the query addresses the ambit: whether it mentions the command at all
 * (widening is suppressed) and which ceiling it positively pins, if any. */
export type AmbitDetection = {
  /** The query mentions the ambit command at all — widening is suppressed. */
  explicit: boolean;
  /** The strictest positively pinned level in the query, or null when the
   * query pins nothing (negated-only mentions still count as explicit). */
  pinned:   Ambit | null;
};

/**
 * Detects the ambit commands in a search DSL: any occurrence (negated or not)
 * makes the query explicit and disables stepwise widening; the strictest
 * positive `ambit:` value is the pinned ceiling the query enforces itself.
 */
export function detectAmbit(dsl: string): AmbitDetection {
  let expr: Expression;

  try {
    expr = simplify(new Parser(dsl).parse());
  } catch {
    return { explicit: false, pinned: null };
  }

  let explicit = false;
  const pins: Ambit[] = [];

  // simplify pushes negation onto simple expressions as the `!` qualifier, so
  // a simple node is negated exactly when its qualifier carries `!`.
  const walk = (node: Expression): void => {
    if (node.type === 'simple') {
      if (node.cmd === ambitCommandName) {
        explicit = true;

        if (!node.qual?.includes('!') && node.op === ':') {
          const value = node.argType === 'string' ? node.args.slice(1, -1) : node.args;
          const level = toAmbit(value);

          if (level != null) {
            pins.push(level);
          }
        }
      }

      return;
    }

    if (node.type === 'not' || node.type === 'paren') {
      walk(node.expr);
      return;
    }

    if (node.type === 'logic') {
      for (const child of node.exprs) walk(child);
    }
  };

  walk(expr);

  // The query enforces the strictest pin it carries, so annotate with that.
  const pinned = pins.length > 0
    ? AMBITS[Math.min(...pins.map(level => AMBITS.indexOf(level)))]!
    : null;

  return { explicit, pinned };
}
