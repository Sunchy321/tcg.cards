/** Scalar field values emitted with hsdata profiling logs. */
export type HsdataProfileValue = boolean | number | string | null | undefined;

/** Structured fields attached to one hsdata profiling event. */
export type HsdataProfileFields = Record<string, HsdataProfileValue>;

/** Incremental profiler used by hsdata import, projection, and publish paths. */
export interface HsdataProfiler {
  mark(step: string, extra?: HsdataProfileFields): void;
  done(extra?: HsdataProfileFields): void;
}

// Structured hsdata profiling event written to the runtime log stream.
function logHsdataProfile(scope: string, event: string, fields: HsdataProfileFields) {
  console.info(`[hearthstone][hsdata][profile][${scope}] ${event}`, fields);
}

/** Profiler that records elapsed time since the previous step and the total start. */
export function createHsdataProfiler(
  scope: string,
  context: HsdataProfileFields,
): HsdataProfiler {
  const startedAt = Date.now();
  let lastStepAt = startedAt;

  return {
    mark(step, extra = {}) {
      const now = Date.now();

      logHsdataProfile(scope, 'step', {
        ...context,
        ...extra,
        step,
        elapsedMs: now - lastStepAt,
        totalMs:   now - startedAt,
      });

      lastStepAt = now;
    },

    done(extra = {}) {
      const now = Date.now();

      logHsdataProfile(scope, 'summary', {
        ...context,
        ...extra,
        totalMs: now - startedAt,
      });
    },
  };
}
