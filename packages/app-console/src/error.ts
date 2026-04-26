export type ConsoleErrorKind =
  | 'auth'
  | 'permission'
  | 'request'
  | 'capability'
  | 'unknown';

export interface ConsoleError {
  kind: ConsoleErrorKind;
  message: string;
  cause?: unknown;
}

export function getConsoleErrorMessage(
  error: unknown,
  fallback = '请稍后重试',
): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string' && error.length > 0) {
    return error;
  }

  if (
    typeof error === 'object'
    && error != null
    && 'message' in error
    && typeof error.message === 'string'
    && error.message.length > 0
  ) {
    return error.message;
  }

  return fallback;
}

export function toConsoleError(
  error: unknown,
  fallback = '请稍后重试',
): ConsoleError {
  const code = (
    typeof error === 'object'
    && error != null
    && 'code' in error
    && typeof error.code === 'string'
  )
    ? error.code
    : null;

  if (code === 'UNAUTHORIZED') {
    return {
      kind: 'auth',
      message: getConsoleErrorMessage(error, fallback),
      cause: error,
    };
  }

  if (code === 'FORBIDDEN') {
    return {
      kind: 'permission',
      message: getConsoleErrorMessage(error, fallback),
      cause: error,
    };
  }

  if (code != null) {
    return {
      kind: 'request',
      message: getConsoleErrorMessage(error, fallback),
      cause: error,
    };
  }

  return {
    kind: 'unknown',
    message: getConsoleErrorMessage(error, fallback),
    cause: error,
  };
}
