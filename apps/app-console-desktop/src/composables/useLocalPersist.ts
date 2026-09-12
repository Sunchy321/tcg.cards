/**
 * Persist page options via localStorage + deep watch, mirroring the
 * hearthstone image page behavior. Defaults persist all keys unless
 * persistKeys is given; transient values (e.g. uploaded file payloads)
 * may live on the same reactive object without being written to storage.
 */
export function useLocalPersist<T extends Record<string, unknown>>(
  key: string,
  defaults: T,
  persistKeys?: (keyof T)[],
) {
  const keys = persistKeys ?? (Object.keys(defaults) as (keyof T)[]);
  const state = reactive<T>({ ...defaults }) as T & Record<string, unknown>;

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, unknown>;
        for (const k of keys) {
          if (saved[k as string] !== undefined) {
            (state as Record<string, unknown>)[k as string] = saved[k as string];
          }
        }
      }
    } catch {
      // ignore malformed storage
    }
  }

  watch(
    () => keys.map(k => state[k]),
    () => {
      if (typeof window === 'undefined') return;
      const payload: Record<string, unknown> = {};
      for (const k of keys) payload[k as string] = state[k];
      try {
        window.localStorage.setItem(key, JSON.stringify(payload));
      } catch {
        // storage full/unavailable: keep the session state usable
      }
    },
    { deep: true },
  );

  return state;
}
