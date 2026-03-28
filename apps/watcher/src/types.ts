// Monitor source configuration
export interface MonitorSourceConfig {
  id:            string;
  name:          string;
  type:          'github-tags' | 'url' | 'api';
  url:           string;
  checkInterval: number; // seconds
}

// Monitor state stored in KV
export interface MonitorState {
  lastValue?:   string;
  lastCheck?:   string;
  lastSuccess?: boolean;
  metadata?:    Record<string, unknown>;
}

// Environment variables
export interface Env {
  WATCHER_KV:     KVNamespace;
  EMAIL_TO:       string;
  RESEND_API_KEY: string;
}

// Check result
export interface CheckResult {
  changed:        boolean;
  currentValue:   string;
  previousValue?: string;
  message:        string;
  url?:           string;
}

// Source checker interface
export interface SourceChecker {
  check(env: Env): Promise<CheckResult>;
}
