/**
 * Mana costs are stored as one braced token sequence (`{2}{C}{C}{C}{2}`) in
 * source order. Every token sits in its own braces and no normalization merges
 * generic tokens, so the stored text doubles as the search dictionary key.
 */

const bracedForm = /^(\{[^{}]+\})*$/;
const bracedToken = /\{([^{}]+)\}/g;

/**
 * Tokens of a stored cost. Well-formed braced text yields its brace contents in
 * order; any other text is kept whole as a single token so a malformed value
 * stays one opaque dimension instead of being silently split.
 */
export function splitCost(cost: string): string[] {
  if (!bracedForm.test(cost)) {
    return cost === '' ? [] : [cost];
  }

  return [...cost.matchAll(bracedToken)].map(match => match[1]!);
}

/** Braced text of the given tokens, the canonical stored form. */
export function joinCost(tokens: readonly string[]): string {
  return tokens.map(token => `{${token}}`).join('');
}

/**
 * Canonical stored form of imported cost text, or null when it carries no
 * token. Import paths run every source value through this so the fact column
 * only ever holds the braced form the query tokenizer expects.
 */
export function normalizeCost(cost: string | null | undefined): string | null {
  if (cost == null) {
    return null;
  }

  const tokens = splitCost(cost.trim());
  return tokens.length === 0 ? null : joinCost(tokens);
}
