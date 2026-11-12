import type { SearchTimingStage } from '#search/schema';

/** Collects ordered, request-scoped search timings with a monotonic clock. */
export class SearchTimingRecorder {
  private readonly stages: SearchTimingStage[] = [];

  /** Measures an asynchronous or synchronous operation and records failures too. */
  async measure<T>(key: string, operation: () => T | PromiseLike<T>): Promise<Awaited<T>> {
    const startedAt = performance.now();

    try {
      return await operation();
    } finally {
      this.stages.push({
        key,
        durationMs: performance.now() - startedAt,
      });
    }
  }

  /** Measures a synchronous operation and records failures too. */
  measureSync<T>(key: string, operation: () => T): T {
    const startedAt = performance.now();

    try {
      return operation();
    } finally {
      this.stages.push({
        key,
        durationMs: performance.now() - startedAt,
      });
    }
  }

  /** Returns a detached snapshot in the order stages completed. */
  snapshot(): SearchTimingStage[] {
    return this.stages.map(stage => ({ ...stage }));
  }
}
