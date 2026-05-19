/** Runtime labels attached to field-edit commits. */
export type ConsoleApiEditorRuntime = 'desktop' | 'site' | 'system';

/** Sync modes mapped to commit sync states on the server. */
export type ConsoleApiSyncMode = 'local_edit' | 'remote_edit' | 'pull';

/** Request metadata propagated from the API caller into commit writers. */
export interface ConsoleApiRequestMeta {
  editorRuntime?: ConsoleApiEditorRuntime;
  syncMode?: ConsoleApiSyncMode;
  editorIdentity?: string | null;
}

/** Per-call client context forwarded through the RPC transport. */
export interface ConsoleApiClientContext {
  meta?: ConsoleApiRequestMeta;
}
