import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { inject, provide, type InjectionKey } from 'vue';

import type { AnyRouter, RouterClient } from '@orpc/server';
import type { ConsoleApiClientContext, ConsoleApiRequestMeta } from '@tcg-cards/console-api/request-meta';
export type { ConsoleApiClientContext, ConsoleApiRequestMeta } from '@tcg-cards/console-api/request-meta';

export interface CreateConsoleApiClientOptions {
  url: string;
  headers?: ConstructorParameters<typeof RPCLink>[0]['headers'];
  fetch?: ConstructorParameters<typeof RPCLink>[0]['fetch'];
  defaultContext?: ConsoleApiClientContext;
}

export interface ConsoleApi {
  request(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  createClient<TRouter extends AnyRouter>(): RouterClient<TRouter, ConsoleApiClientContext>;
}

export interface ConsoleRouter {
  currentPath(): string;
  push(path: string): Promise<void> | void;
  replace(path: string): Promise<void> | void;
}

export interface ConsoleSession<TSession = unknown> {
  get(): TSession | null;
  set(session: TSession | null): void;
}

export interface ConsoleStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface ConsoleToastInput {
  title: string;
  description?: string;
  color?: 'error' | 'info' | 'primary' | 'success' | 'warning';
}

export interface ConsoleToast {
  show(input: ConsoleToastInput): void;
}

export type ConsoleCapabilityLevel = 'light' | 'medium' | 'full';

export type ConsoleCapabilityErrorCode =
  | 'unsupported'
  | 'permission_denied'
  | 'cancelled'
  | 'invalid_input'
  | 'failed';

export class ConsoleCapabilityError extends Error {
  code: ConsoleCapabilityErrorCode;

  constructor(code: ConsoleCapabilityErrorCode, message: string) {
    super(message);
    this.name = 'ConsoleCapabilityError';
    this.code = code;
  }
}

export interface ConsoleFilePickerFilter {
  name: string;
  extensions: string[];
}

export interface ConsolePickFilesInput {
  multiple?: boolean;
  directory?: boolean;
  filters?: ConsoleFilePickerFilter[];
}

export interface ConsolePickFilesResult {
  paths: string[];
}

export interface ConsoleGitRepositoryRef {
  path: string;
}

export interface ConsoleGitTag {
  name: string;
  commit?: string;
}

export interface ConsoleToolRunInput {
  name: string;
  args?: string[];
  cwd?: string;
}

export interface ConsoleToolRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ConsoleUploadFileInput {
  path: string;
  contentType?: string;
}

export interface ConsoleUploadFileResult {
  url?: string;
  key?: string;
}

export interface ConsoleFileCapabilities {
  pick(input?: ConsolePickFilesInput): Promise<ConsolePickFilesResult>;
}

export interface ConsoleGitCapabilities {
  selectRepository(): Promise<ConsoleGitRepositoryRef>;
  listTags(repository: ConsoleGitRepositoryRef): Promise<ConsoleGitTag[]>;
}

export interface ConsoleToolCapabilities {
  run(input: ConsoleToolRunInput): Promise<ConsoleToolRunResult>;
}

export interface ConsoleUploadCapabilities {
  uploadFile(input: ConsoleUploadFileInput): Promise<ConsoleUploadFileResult>;
}

export interface ConsoleCapabilities {
  level: ConsoleCapabilityLevel;
  files: ConsoleFileCapabilities;
  git: ConsoleGitCapabilities;
  tools: ConsoleToolCapabilities;
  upload: ConsoleUploadCapabilities;
}

export interface ConsolePlatform<TSession = unknown> {
  api: ConsoleApi;
  router: ConsoleRouter;
  session: ConsoleSession<TSession>;
  storage: ConsoleStorage;
  toast: ConsoleToast;
}

export const consolePlatformKey: InjectionKey<ConsolePlatform<unknown>> = Symbol('console-platform');

function unsupported(name: string): Promise<never> {
  return Promise.reject(new ConsoleCapabilityError('unsupported', `${name} is not supported`));
}

export function createConsolePlatform<TSession>(
  platform: ConsolePlatform<TSession>,
): ConsolePlatform<TSession> {
  return platform;
}

export function createConsoleApiClient<TRouter extends AnyRouter>(
  options: CreateConsoleApiClientOptions,
): RouterClient<TRouter, ConsoleApiClientContext> {
  const link = new RPCLink<ConsoleApiClientContext>({
    url: options.url,
    headers: async (clientOptions, path, input) => {
      const mergedContext = mergeClientContext(options.defaultContext, clientOptions.context);
      const baseHeaders = await resolveHeaders(options.headers, {
        ...clientOptions,
        context: mergedContext,
      }, path, input);
      const headers = toHeaders(baseHeaders);

      applyRequestMetaHeaders(headers, mergedContext.meta);

      return headers;
    },
    fetch: options.fetch,
  });

  return createORPCClient(link) as RouterClient<TRouter, ConsoleApiClientContext>;
}

/** Resolves user-supplied headers into a concrete header bag. */
async function resolveHeaders(
  value: CreateConsoleApiClientOptions['headers'],
  clientOptions: { context: ConsoleApiClientContext; signal?: AbortSignal; lastEventId?: string },
  path: readonly string[],
  input: unknown,
) {
  if (typeof value === 'function') {
    return await value(clientOptions, path, input);
  }

  return value;
}

/** Converts supported header containers into a mutable `Headers` instance. */
function toHeaders(value: Headers | Record<string, string | string[] | undefined> | undefined) {
  if (value instanceof Headers) {
    return new Headers(value);
  }

  const headers = new Headers();

  for (const [key, item] of Object.entries(value ?? {})) {
    if (Array.isArray(item)) {
      for (const entry of item) {
        headers.append(key, entry);
      }
    } else if (item != null) {
      headers.set(key, item);
    }
  }

  return headers;
}

/** Merges per-platform default context with one call-specific context. */
function mergeClientContext(
  base: ConsoleApiClientContext | undefined,
  override: ConsoleApiClientContext | undefined,
): ConsoleApiClientContext {
  return {
    ...base,
    ...override,
    meta: {
      ...base?.meta,
      ...override?.meta,
    },
  };
}

/** Encodes request metadata into transport headers understood by the RPC server. */
function applyRequestMetaHeaders(headers: Headers, meta: ConsoleApiRequestMeta | undefined) {
  if (meta?.editorRuntime != null) {
    headers.set('x-tcg-editor-runtime', meta.editorRuntime);
  }

  if (meta?.syncMode != null) {
    headers.set('x-tcg-sync-mode', meta.syncMode);
  }

  if (meta?.editorIdentity != null) {
    headers.set('x-tcg-editor-identity', meta.editorIdentity);
  }
}

export function createConsoleSession<TSession>(options: {
  get(): TSession | null;
  set?(session: TSession | null): void;
}): ConsoleSession<TSession> {
  return {
    get: options.get,
    set(session) {
      options.set?.(session);
    },
  };
}

export function createConsoleStorage(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): ConsoleStorage {
  return {
    get(key) {
      return storage.getItem(key);
    },
    set(key, value) {
      storage.setItem(key, value);
    },
    remove(key) {
      storage.removeItem(key);
    },
  };
}

export function createMemoryStorage(): ConsoleStorage {
  const values = new Map<string, string>();

  return {
    get(key) {
      return values.get(key) ?? null;
    },
    set(key, value) {
      values.set(key, value);
    },
    remove(key) {
      values.delete(key);
    },
  };
}

export function createUnsupportedConsoleCapabilities(
  level: ConsoleCapabilityLevel = 'light',
): ConsoleCapabilities {
  return {
    level,
    files: {
      pick() {
        return unsupported('files.pick');
      },
    },
    git: {
      selectRepository() {
        return unsupported('git.selectRepository');
      },
      listTags() {
        return unsupported('git.listTags');
      },
    },
    tools: {
      run() {
        return unsupported('tools.run');
      },
    },
    upload: {
      uploadFile() {
        return unsupported('upload.uploadFile');
      },
    },
  };
}

export function provideConsolePlatform<TSession>(
  platform: ConsolePlatform<TSession>,
): ConsolePlatform<TSession> {
  provide(consolePlatformKey, platform as ConsolePlatform<unknown>);
  return platform;
}

export function useConsolePlatform<TSession = unknown>(): ConsolePlatform<TSession> {
  const platform = inject(consolePlatformKey, null);

  if (!platform) {
    throw new Error('Console platform is not provided');
  }

  return platform as ConsolePlatform<TSession>;
}
