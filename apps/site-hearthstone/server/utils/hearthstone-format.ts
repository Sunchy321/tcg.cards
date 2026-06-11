export const standardCoreSets = ['SET_1637'] as const;

export const standardExpansionSets = [
  'SET_1946',
  'SET_1952',
  'SET_1957',
  'SET_1980',
] as const;

export const standardSets = [
  ...standardCoreSets,
  ...standardExpansionSets,
] as const;

// Checks whether the set belongs to the current Hearthstone Standard format.
export function isStandardSet(set: string | null | undefined) {
  return set != null && (standardSets as readonly string[]).includes(set);
}
