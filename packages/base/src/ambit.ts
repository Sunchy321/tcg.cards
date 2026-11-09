/**
 * The universal card ambit ladder (CONTEXT.md "card ambit", ADR 0015).
 * Declaration order is the ladder order — primary ⊂ additional ⊂ full — so
 * the array doubles as the stepwise widening sequence and the pg enum's
 * comparison order. Single source of the ambit values: the shared model
 * derives its zod enum from it and the search package builds its DSL
 * machinery on top.
 */
export const AMBITS = [
  'primary',
  'additional',
  'full',
] as const;

/** One rung of the universal card ambit ladder. */
export type Ambit = (typeof AMBITS)[number];

/** Parses a value into its ambit level; null when the value is not a level. */
export function toAmbit(value: string): Ambit | null {
  const level = value.toLowerCase() as Ambit;

  return AMBITS.includes(level) ? level : null;
}
