import type { PublishReport } from './hsdata-publish';

/** Cooperative interrupt raised inside the running publish coroutine after a stop request. */
export class PublishJobInterruptedError extends Error {
  phase: 'stopped';

  constructor(phase: 'stopped', message: string) {
    super(message);
    this.phase = phase;
  }
}

/** Per-job controller for signalling stop into the running publish coroutine. */
export class PublishJobController {
  private _shouldStop = false;

  get shouldStop(): boolean { return this._shouldStop; }

  requestStop(): void { this._shouldStop = true; }
}

let currentJobController: PublishJobController | null = null;

/** Returns the controller bound to the current publish job, if any. */
export function getPublishJobController(): PublishJobController | null {
  return currentJobController;
}

let currentJob: { batchId: string } | null = null;

/** Returns the currently running publish job, or null if no job is active. */
export function getCurrentPublishJob(): { batchId: string } | null {
  return currentJob;
}

/** Starts a publish job entry. Minimal stub kept for residual batch detection. */
export function startPublishJob(input: { batchId: string }): void {
  currentJob = { batchId: input.batchId };
  currentJobController = new PublishJobController();
}
