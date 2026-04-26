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

function unsupported(name: string): Promise<never> {
  return Promise.reject(new ConsoleCapabilityError('unsupported', `${name} is not supported`));
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
