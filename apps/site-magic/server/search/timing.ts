import type { SearchTimingRecorder } from '#search/server/timing';

/** Measures one optional Magic search stage with the request-local recorder. */
export function measureMagicSearchStep<T>(
  timing: SearchTimingRecorder | undefined,
  key: string,
  operation: () => T | PromiseLike<T>,
): T | Promise<Awaited<T>> {
  if (timing == null) {
    return operation();
  }

  return timing.measure(key, operation);
}

/** Measures one optional synchronous Magic search stage with the request-local recorder. */
export function measureMagicSearchStepSync<T>(
  timing: SearchTimingRecorder | undefined,
  key: string,
  operation: () => T,
): T {
  if (timing == null) {
    return operation();
  }

  return timing.measureSync(key, operation);
}
