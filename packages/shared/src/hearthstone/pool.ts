/**
 * Pool-rotation marker.
 *
 * A pool rotation is expressed as a `set_change` (set pool, e.g. arena) or
 * `card_change` (card pool, e.g. battlegrounds trinkets) item whose id field
 * carries `#full`, with `status` set to `unavailable`. It operates on every
 * card currently in the pool; the legal items that follow for the same
 * (format, group) rebuild the pool. A card in the old pool that is declared
 * legal again cancels out (renders nothing).
 *
 * Marker namespaces: `#` prefixes card groups (`#full` is the special group
 * "the whole pool"), `@` is reserved for future operations.
 */
export const GROUP_MARKER_PREFIX = '#';
export const OPERATION_PREFIX = '@';

/** `#full`: operate on every card currently in the pool (status must be unavailable). */
export const POOL_FULL = `${GROUP_MARKER_PREFIX}full`;

/** True when an id is a non-card marker (`#` group or `@` operation). */
export function isMarker(id: string | null | undefined): boolean {
  return id != null && (id.startsWith(GROUP_MARKER_PREFIX) || id.startsWith(OPERATION_PREFIX));
}

/** True when an id is the pool-full directive. */
export function isPoolFull(id: string | null | undefined): boolean {
  return id === POOL_FULL;
}
