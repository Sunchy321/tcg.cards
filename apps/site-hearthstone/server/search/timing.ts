import type { SearchTimingRecorder } from '#search/server/timing';

/** Measures one optional Hearthstone search stage without requiring a recorder. */
export function measureSearchStep<T>(
  timing: SearchTimingRecorder | undefined,
  key: string,
  operation: () => T | PromiseLike<T>,
): T | Promise<Awaited<T>> {
  if (timing == null) {
    return operation();
  }

  return timing.measure(key, operation);
}

/** Measures one optional synchronous Hearthstone search stage. */
export function measureSearchStepSync<T>(
  timing: SearchTimingRecorder | undefined,
  key: string,
  operation: () => T,
): T {
  if (timing == null) {
    return operation();
  }

  return timing.measureSync(key, operation);
}
