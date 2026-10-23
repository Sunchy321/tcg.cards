import { utilityProcess } from 'electron';
import type { UtilityProcess } from 'electron';

import type { RuntimeHealth, RuntimeResponse } from './contract';

/** Pending business calls rejected when their process exits or times out. */
interface PendingCall {
  resolve(value: RuntimeHealth): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}

/** Owns the business process and correlates its replies without a local HTTP port. */
export class RuntimeClient {
  private process: UtilityProcess;
  private pending = new Map<number, PendingCall>();
  private nextId = 0;
  private available = true;

  /** Starts the bundled Node business entrypoint for this app instance. */
  constructor(entry: string) {
    this.process = utilityProcess.fork(entry, [], { serviceName: 'TCG Cards' });
    this.process.on('message', (response: RuntimeResponse) => {
      const call = this.pending.get(response.id);
      if (!call) return;
      clearTimeout(call.timeout);
      this.pending.delete(response.id);
      call.resolve(response.result);
    });
    this.process.on('exit', () => {
      this.available = false;
      this.rejectPending(new Error('Local business process exited'));
    });
  }

  /** Queries the live Node business process through its private message port. */
  health(): Promise<RuntimeHealth> {
    if (!this.available) return Promise.reject(new Error('Local business process unavailable'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Local business process timed out'));
      }, 10_000);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        this.process.postMessage({ id, method: 'health' });
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  /** Releases the business process when the application exits. */
  stop() {
    this.available = false;
    this.rejectPending(new Error('Application is quitting'));
    this.process.kill();
  }

  /** Settles every in-flight call when its execution context disappears. */
  private rejectPending(error: Error) {
    for (const call of this.pending.values()) {
      clearTimeout(call.timeout);
      call.reject(error);
    }
    this.pending.clear();
  }
}
