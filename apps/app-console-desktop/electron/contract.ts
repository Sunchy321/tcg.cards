import type { SettingsSnapshot } from '../shared/settings';
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { RuntimeOverrides } from './runtime/runtime-config';

/** User-facing target and scope shown before one publish task is accepted. */
export interface PublishConfirmation {
  environment: string;
  scope:       string;
}

/** Health information returned by the isolated local business process. */
export interface RuntimeHealth {
  runtime: 'node';
  pid:     number;
  version: string;
}

/** Configuration snapshot passed from Electron to the isolated runtime process. */
export type { RuntimeOverrides };

/** Restricted native capabilities available to the desktop renderer. */
export interface DesktopBridge {
  onOpenSettings(listener: () => void): () => void;
  external: { open(url: string): Promise<void> };
  files: {
    pickZipArchive(): Promise<string | null>;
  };
  auth: {
    status(): Promise<RemoteAuthStatus>;
    login(baseUrl: string, username: string, password: string): Promise<RemoteAuthStatus>;
    logout(): Promise<RemoteAuthStatus>;
  };
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
  api: {
    request(input: DesktopApiRequest): Promise<DesktopApiResponse>;
    cancel(requestId: string): void;
    onStream(listener: (event: DesktopApiStreamEvent) => void): () => void;
  };
  tasks: {
    start(taskType: string, params: Record<string, unknown>): Promise<TaskStartReply | null>;
    retry(taskRunId: string): Promise<TaskStartReply | null>;
    control(taskRunId: string, kind: TaskControlKind): Promise<TaskView>;
    latestByTypes(taskTypes: string[]): Promise<TaskView[]>;
    list(): Promise<TaskView[]>;
    get(taskRunId: string): Promise<TaskView | null>;
    onChange(listener: (task: TaskView) => void): () => void;
  };
}

/** HTTP-shaped request carried through private IPC to the local business process. */
export interface DesktopApiRequest {
  requestId: string;
  path:      string;
  method:    string;
  headers:   Array<[string, string]>;
  body:      Uint8Array | null;
}

/** Response metadata returned before its body stream is relayed over IPC. */
export interface DesktopApiResponse {
  status:  number;
  headers: Array<[string, string]>;
}

/** One response-body chunk or terminal notification for a renderer request. */
export interface DesktopApiStreamEvent {
  requestId: string;
  kind:      'chunk' | 'end';
  chunk?:    Uint8Array;
  error?:    string;
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
  id:            string;
  taskType:      string;
  label:         string;
  /** Persisted lifecycle state; discarded marks a renderer identity that lost a creation race and never existed. */
  status:        string;
  phase:         'accepted' | 'saving' | 'starting' | 'loading' | 'running' | 'finished';
  elapsedMs:     number;
  stages:        TaskStageView[];
  result:        Record<string, unknown> | null;
  errorMessage:  string | null;
  createdAt:     string;
  startedAt:     string | null;
  finishedAt:    string | null;
  /** Task page view produced from the same persisted run and stage rows. */
  pageSnapshot?: TaskPageSnapshot;
}

/** Request sent only between the main and local business processes. */
export type RuntimeRequest
  = | { id: number, method: 'health' }
    | { id: number, method: 'shutdown' }
    | { id: number, method: 'task:describe', taskType: string, params?: Record<string, unknown> }
    | { id: number, method: 'task:describe-retry', taskRunId: string, databaseUrl: string }
    | { id: number, method: 'task:find-active', taskType: string, databaseUrl: string }
    | { id: number, method: 'task:start', taskRunId: string, taskType: string, params: Record<string, unknown>, databaseUrl: string }
    | { id: number, method: 'task:retry', taskRunId: string, retryOfTaskRunId: string, databaseUrl: string, operatorUserId?: string }
    | { id: number, method: 'task:control', taskRunId: string, kind: TaskControlKind, databaseUrl: string }
    | { id: number, method: 'task:latest-by-types', taskTypes: string[], databaseUrl: string }
    | { id: number, method: 'task:list', databaseUrl?: string }
    | { id: number, method: 'task:get', taskRunId: string, databaseUrl?: string }
    | { id: number, method: 'api:request', path: string, requestMethod: string, headers: Array<[string, string]>, body: Uint8Array | null }
    | { id: number, method: 'api:cancel', requestId: number }
    | { id: number, method: 'runtime:configure', state: RuntimeOverrides };

/** Response sent only between the local business and main processes. */
export interface RuntimeResponse {
  id:      number;
  result?: RuntimeHealth | TaskDescription | TaskView | TaskView[] | TaskStartResult | DesktopApiResponse | null;
  error?:  string;
}

/** Registration facts the main process needs before a run exists. */
export interface TaskDescription {
  taskType:            string;
  /** Present when starting this task type requires remote publish admission. */
  admission:           { game: AdmissionGame } | null;
  /** Present when the task registration can describe its target and publish scope. */
  publishConfirmation: PublishConfirmation | null;
}

/** Games whose data a publish admission can be requested for. */
export type AdmissionGame = 'magic' | 'hearthstone' | 'yugioh' | 'shadowverse';

/** A control or progress notification sent from one Worker to the task host. */
export interface WorkerMessage {
  taskRunId: string;
  phase?:    TaskView['phase'];
  /** Signals that a control request settled without changing the startup phase. */
  settled?:  boolean;
}

/** A control instruction sent from the task host to one Worker; shutdown stops it at a safe boundary. */
export interface WorkerCommand {
  taskRunId: string;
  control:   TaskControlKind | 'shutdown';
}

/** A task update pushed from the task host to every open renderer. */
export interface RuntimeTaskEvent {
  event: 'task:changed';
  task:  TaskView;
}

/** A response body chunk produced by the local service Fetch handler. */
export interface RuntimeApiStreamEvent {
  event:  'api:chunk' | 'api:end';
  id:     number;
  chunk?: Uint8Array;
  error?: string;
}

/** Any asynchronous event emitted by the local business process. */
export type RuntimeProcessEvent = RuntimeTaskEvent | RuntimeApiStreamEvent;

export const HEALTH_CHANNEL = 'desktop:runtime:health';
export const TASK_CHANNEL = 'desktop:task';
export const TASK_CHANGED_CHANNEL = 'desktop:task:changed';
export const API_CHANNEL = 'desktop:api';
export const API_CANCEL_CHANNEL = 'desktop:api:cancel';
export const API_STREAM_CHANNEL = 'desktop:api:stream';
export const OPEN_SETTINGS = 'desktop:open-settings';
export const EXTERNAL_OPEN_CHANNEL = 'desktop:external:open';
export const FILE_DIALOG_CHANNEL = 'desktop:files:dialog';

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

/** Local view of the persisted console session; loggedIn never contacts the backend. */
export interface RemoteAuthStatus {
  baseUrl:   string | null;
  username:  string | null;
  expiresAt: string | null;
  loggedIn:  boolean;
}

/** Remote-session requests admitted by the main-process gateway. */
export type AuthRequest
  = | { action: 'status' }
    | { action: 'login', baseUrl: string, username: string, password: string }
    | { action: 'logout' };

export const AUTH_CHANNEL = 'desktop:auth';
