import type { SettingsSnapshot } from '../shared/settings';

/** Health information returned by the isolated local business process. */
export interface RuntimeHealth {
  runtime: 'node';
  pid:     number;
  version: string;
}

/** Restricted native capabilities available to the desktop renderer. */
export interface DesktopBridge {
  onOpenSettings(listener: () => void): () => void;
  settings: {
    read(): Promise<SettingsSnapshot>;
    update(key: string, value: unknown): Promise<SettingsSnapshot>;
    saveJson(text: string, revision: number): Promise<SettingsSnapshot>;
    setSecret(key: string, value: string | null): Promise<SettingsSnapshot>;
    pickDirectory(current: string | null): Promise<string | null>;
    openDirectory(): Promise<void>;
    paths(game: 'magic' | 'hearthstone'): Promise<GamePaths>;
    setDirty(value: boolean): Promise<void>;
    resolveClose(choice: 'save' | 'discard' | 'cancel'): Promise<void>;
    onCloseRequested(listener: () => void): () => void;
  };
  runtime: {
    health(): Promise<RuntimeHealth>;
  };
  tasks: {
    start(taskType: string, params: Record<string, unknown>): Promise<TaskStartReply>;
    retry(taskRunId: string): Promise<TaskStartReply>;
    control(taskRunId: string, kind: TaskControlKind): Promise<TaskView>;
    latestByTypes(taskTypes: string[]): Promise<TaskView[]>;
    list(): Promise<TaskView[]>;
    get(taskRunId: string): Promise<TaskView | null>;
    onChange(listener: (task: TaskView) => void): () => void;
  };
}

/** Control operations admitted while one run is unfinished. */
export type TaskControlKind = 'pause' | 'resume' | 'cancel';

/** Reply to a launch or retry request; existing means an unfinished run was reused. */
export interface TaskStartReply {
  taskRunId: string;
  existing:  boolean;
}

/** Host-side outcome of a create-or-reuse request for one task type. */
export interface TaskStartResult {
  created: boolean;
  task:    TaskView;
}

/** A stage snapshot safe to display in the renderer. */
export interface TaskStageView {
  key:    string;
  label:  string;
  status: string;
  done:   number | null;
  total:  number | null;
}

/** A public view of one persisted task run. */
export interface TaskView {
  id:           string;
  taskType:     string;
  label:        string;
  /** Persisted lifecycle state; discarded marks a renderer identity that lost a creation race and never existed. */
  status:       string;
  phase:        'accepted' | 'saving' | 'starting' | 'loading' | 'running' | 'finished';
  elapsedMs:    number;
  stages:       TaskStageView[];
  result:       Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt:    string;
  startedAt:    string | null;
  finishedAt:   string | null;
}

/** Request sent only between the main and local business processes. */
export type RuntimeRequest
  = | { id: number, method: 'health' }
    | { id: number, method: 'task:find-active', taskType: string, databaseUrl: string }
    | { id: number, method: 'task:start', taskRunId: string, taskType: string, params: Record<string, unknown>, databaseUrl: string }
    | { id: number, method: 'task:retry', taskRunId: string, retryOfTaskRunId: string, databaseUrl: string }
    | { id: number, method: 'task:control', taskRunId: string, kind: TaskControlKind, databaseUrl: string }
    | { id: number, method: 'task:latest-by-types', taskTypes: string[], databaseUrl: string }
    | { id: number, method: 'task:list', databaseUrl?: string }
    | { id: number, method: 'task:get', taskRunId: string, databaseUrl?: string };

/** Response sent only between the local business and main processes. */
export interface RuntimeResponse {
  id:      number;
  result?: RuntimeHealth | TaskView | TaskView[] | TaskStartResult | null;
  error?:  string;
}

/** A control or progress notification sent from one Worker to the task host. */
export interface WorkerMessage {
  taskRunId: string;
  phase?:    TaskView['phase'];
  /** Signals that a control request settled without changing the startup phase. */
  settled?:  boolean;
}

/** A control instruction sent from the task host to one Worker. */
export interface WorkerCommand {
  taskRunId: string;
  control:   TaskControlKind;
}

/** A task update pushed from the task host to every open renderer. */
export interface RuntimeTaskEvent {
  event: 'task:changed';
  task:  TaskView;
}

export const HEALTH_CHANNEL = 'desktop:runtime:health';
export const TASK_CHANNEL = 'desktop:task';
export const TASK_CHANGED_CHANNEL = 'desktop:task:changed';
export const OPEN_SETTINGS = 'desktop:open-settings';

/** Settings requests admitted by the main-process gateway. */
export type SettingsRequest
  = | { action: 'read' }
    | { action: 'update', key: string, value: unknown }
    | { action: 'json', text: string, revision: number }
    | { action: 'secret', key: string, value: string | null }
    | { action: 'directory', current: string | null }
    | { action: 'openDirectory' }
    | { action: 'paths', game: 'magic' | 'hearthstone' };
/** Close decisions are sent only after unsaved JSON has been dealt with. */
export type CloseRequest = { action: 'dirty', value: boolean } | { action: 'resolve', choice: 'save' | 'discard' | 'cancel' };
/** Derived directories for one game, never persisted merely by reading them. */
export type GamePaths = Record<'data' | 'image', { root: string | null, leaves: { key: string, label: string, path: string | null }[] }>;

export const SETTINGS_CHANNEL = 'desktop:settings';
export const CLOSE_CHANNEL = 'desktop:settings:close';
export const CLOSE_REQUESTED = 'desktop:settings:close-requested';
