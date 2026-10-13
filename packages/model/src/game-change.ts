/** Per-change-type entry of a game's status declaration: allowed statuses and the fallback status. */
export interface ChangeStatusByTypeEntry<Status extends string> {
  statuses: Status[];
  default:  Status | null;
}

/** A game's full status declaration, keyed by game change type. */
export type ChangeStatusByTypeMap<Type extends string, Status extends string> = Record<Type, ChangeStatusByTypeEntry<Status>>;

/**
 * Validates and returns a game's status declaration: every game change type
 * must have an entry and a non-null default must be one of that entry's
 * statuses. The declaration fails fast at import time so a drift between the
 * type enum and the status map surfaces as a broken startup, not bad editor
 * data. The map parameter requires an entry per declared type, so a missing
 * entry fails the compile at the declaration; the runtime check still covers
 * dynamically built maps. Statuses and defaults infer as a literal union, so
 * call sites need no explicit type annotation.
 */
export function defineChangeStatusByType<Type extends string, const Status extends string>(
  types: readonly Type[],
  map: { [K in Type]: ChangeStatusByTypeEntry<Status> },
): { [K in Type]: ChangeStatusByTypeEntry<Status> } {
  for (const type of types) {
    const entry = map[type];
    if (entry == null) {
      throw new Error(`changeStatusByType is missing an entry for type ${type}`);
    }
    if (entry.default != null && !entry.statuses.includes(entry.default)) {
      throw new Error(`changeStatusByType default ${entry.default} of type ${type} is not in its statuses`);
    }
  }
  return map;
}
