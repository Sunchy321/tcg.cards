/** Health information returned by the isolated local business process. */
export interface RuntimeHealth {
  runtime: 'node';
  pid: number;
  version: string;
}

/** Restricted native capabilities available to the desktop renderer. */
export interface DesktopBridge {
  runtime: {
    health(): Promise<RuntimeHealth>;
  };
}

/** Request sent only between the main and local business processes. */
export interface RuntimeRequest {
  id: number;
  method: 'health';
}

/** Response sent only between the local business and main processes. */
export interface RuntimeResponse {
  id: number;
  result: RuntimeHealth;
}

export const HEALTH_CHANNEL = 'desktop:runtime:health';
