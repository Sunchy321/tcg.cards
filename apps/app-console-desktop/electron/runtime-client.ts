import { utilityProcess } from 'electron';
import type { UtilityProcess } from 'electron';

import type { RuntimeHealth, RuntimeRequest, RuntimeResponse, RuntimeTaskEvent, TaskView } from './contract';

/** Pending business calls rejected when their process exits or times out. */
interface PendingCall {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}

/** Owns the business process and correlates its replies without a local HTTP port. */
export class RuntimeClient {
  private process: UtilityProcess;
  private pending = new Map<number, PendingCall>();
  private listeners = new Set<(task: TaskView) => void>();
  private nextId = 0;
  private available = true;

  /** Starts the bundled Node business entrypoint for this app instance. */
  constructor(entry: string) {
    this.process = utilityProcess.fork(entry, [], { serviceName: 'TCG Cards' });
    this.process.on('message', (message: RuntimeResponse | RuntimeTaskEvent) => {
      if ('event' in message) {
        for (const listener of this.listeners) listener(message.task);
        return;
      }
      const call = this.pending.get(message.id);
      if (!call) return;
      clearTimeout(call.timeout);
      this.pending.delete(message.id);
      if (message.error) call.reject(new Error(message.error));
      else call.resolve(message.result);
    });
    this.process.on('exit', () => {
      this.available = false;
      this.rejectPending(new Error('Local business process exited'));
    });
  }

  /** Subscribes to authoritative changes while the main process remains alive. */
  onTaskChange(listener: (task: TaskView) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Queries the live Node business process through its private message port. */
  health(): Promise<RuntimeHealth> {
    return this.call<RuntimeHealth>({ id: ++this.nextId, method: 'health' });
  }

  /** Saves and dispatches one task after the main process accepts its identity. */
  start(taskRunId: string, taskType: string, params: Record<string, unknown>, databaseUrl: string): Promise<TaskView> {
    return this.call<TaskView>({ id: ++this.nextId, method: 'task:start', taskRunId, taskType, params, databaseUrl });
  }

  /** Lists unfinished tasks from the persistent task store. */
  list(databaseUrl?: string): Promise<TaskView[]> {
    return this.call<TaskView[]>({ id: ++this.nextId, method: 'task:list', databaseUrl });
  }

  /** Reads one task run regardless of its current status. */
  get(taskRunId: string, databaseUrl?: string): Promise<TaskView | null> {
    return this.call<TaskView | null>({ id: ++this.nextId, method: 'task:get', taskRunId, databaseUrl });
  }

  /** Releases the business process when the application exits. */
  stop(): void {
    this.available = false;
    this.rejectPending(new Error('Application is quitting'));
    this.process.kill();
  }

  /** Sends one typed request and rejects it if the process disappears. */
  private call<T>(request: RuntimeRequest): Promise<T> {
    if (!this.available) return Promise.reject(new Error('Local business process unavailable'));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error('Local business process timed out'));
      }, 30_000);
      this.pending.set(request.id, { resolve: value => resolve(value as T), reject, timeout });
      try {
        this.process.postMessage(request);
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(request.id);
        reject(error);
      }
    });
  }

  /** Settles every in-flight call when its execution context disappears. */
  private rejectPending(error: Error): void {
    for (const call of this.pending.values()) {
      clearTimeout(call.timeout);
      call.reject(error);
    }
    this.pending.clear();
  }
}
