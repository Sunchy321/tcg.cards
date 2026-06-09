/** Scalar field values emitted with hsdata profiling logs. */
export type HsdataProfileValue = boolean | number | string | null | undefined;

/** Structured fields attached to one hsdata profiling event. */
export type HsdataProfileFields = Record<string, HsdataProfileValue>;

/** One recorded profiling step. */
export interface HsdataProfileStep {
  step: string;
  elapsedMs: number;
  totalMs: number;
  extra?: HsdataProfileFields;
}

/** Callback invoked each time a profiling step completes. */
export type HsdataProfileMarkHandler = (step: HsdataProfileStep) => void;

/** Incremental profiler used by hsdata import, projection, and publish paths. */
export interface HsdataProfiler {
  mark(step: string, extra?: HsdataProfileFields): void;
  done(extra?: HsdataProfileFields): void;
}

// Structured hsdata profiling event written to the runtime log stream.
function logHsdataProfile(scope: string, event: string, fields: HsdataProfileFields) {
  console.info(`[hearthstone][hsdata][profile][${scope}] ${event}`, fields);
}

export interface CreateHsdataProfilerOptions {
  onMark?: HsdataProfileMarkHandler;
  silent?: boolean;
}

/** Profiler that records elapsed time since the previous step and the total start. */
export function createHsdataProfiler(
  scope: string,
  context: HsdataProfileFields,
  options?: CreateHsdataProfilerOptions,
): HsdataProfiler {
  const startedAt = Date.now();
  let lastStepAt = startedAt;
  const { onMark, silent } = options ?? {};

  return {
    mark(step, extra = {}) {
      const now = Date.now();
      const elapsedMs = now - lastStepAt;
      const totalMs = now - startedAt;

      if (!silent) {
        logHsdataProfile(scope, 'step', {
          ...context,
          ...extra,
          step,
          elapsedMs,
          totalMs,
        });
      }

      onMark?.({ step, elapsedMs, totalMs, extra });

      lastStepAt = now;
    },

    done(extra = {}) {
      const now = Date.now();

      if (!silent) {
        logHsdataProfile(scope, 'summary', {
          ...context,
          ...extra,
          totalMs: now - startedAt,
        });
      }
    },
  };
}
