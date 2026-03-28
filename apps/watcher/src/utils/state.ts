import type { Env, MonitorState } from '../types';

const STATE_PREFIX = 'state:';
const ALERT_PREFIX = 'alert:';

export async function loadState(
  env: Env,
  sourceId: string,
): Promise<MonitorState | null> {
  const key = `${STATE_PREFIX}${sourceId}`;
  const data = await env.WATCHER_KV.get(key);

  if (!data) return null;

  try {
    return JSON.parse(data) as MonitorState;
  } catch {
    return null;
  }
}

export async function saveState(
  env: Env,
  sourceId: string,
  state: MonitorState,
): Promise<void> {
  const key = `${STATE_PREFIX}${sourceId}`;
  await env.WATCHER_KV.put(key, JSON.stringify(state));
}

export async function shouldSendFailureAlert(
  env: Env,
  sourceId: string,
): Promise<boolean> {
  const key = `${ALERT_PREFIX}${sourceId}:failure`;
  const lastAlert = await env.WATCHER_KV.get(key);

  if (!lastAlert) return true;

  const lastAlertTime = parseInt(lastAlert, 10);
  const now = Date.now();

  // Only alert once per 24 hours
  return now - lastAlertTime > 24 * 60 * 60 * 1000;
}

export async function markFailureAlertSent(
  env: Env,
  sourceId: string,
): Promise<void> {
  const key = `${ALERT_PREFIX}${sourceId}:failure`;
  await env.WATCHER_KV.put(key, Date.now().toString());
}
