import type { SQL } from 'drizzle-orm';
import { and, or } from 'drizzle-orm';

/**
 * Splits a bare command value into OR groups of AND terms: `a|b&c` becomes
 * `[[a], [b, c]]`, `a,b` stays one term (comma handling is command-specific).
 * Only bare-id values are split — quoted strings and regexes reach commands
 * untouched.
 */
export function splitValueGroups(value: string): string[][] {
  return value.split('|').map(group => group.split('&'));
}

/**
 * Combines per-term predicates: every term in a group must match, and one
 * matching group is enough. Single-term values return the term predicate
 * unchanged, so existing single-value behavior is preserved exactly.
 */
export function matchValueGroups(groups: string[][], term: (value: string) => SQL): SQL {
  const groupPredicates = groups.map(group =>
    group.length === 1 ? term(group[0]!) : and(...group.map(term))!,
  );

  return (groupPredicates.length === 1 ? groupPredicates[0]! : or(...groupPredicates))!;
}
