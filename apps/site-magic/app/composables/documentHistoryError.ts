/** Select the reader-facing state from the RPC error category without exposing internal details. */
export function documentHistoryErrorKey(error: unknown): 'not_found' | 'load_failed' {
  return typeof error === 'object' && error != null && 'code' in error && error.code === 'NOT_FOUND'
    ? 'not_found'
    : 'load_failed';
}
