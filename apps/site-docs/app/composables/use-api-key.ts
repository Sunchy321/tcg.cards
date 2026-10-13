const STORAGE_KEY = 'tcg-docs-api-key';

const apiKey = ref<string | null>(null);

if (import.meta.client) {
  apiKey.value = localStorage.getItem(STORAGE_KEY);
}

/** Sets the shared API key and persists it to localStorage. */
export function setApiKey(key: string) {
  apiKey.value = key;
  if (import.meta.client) {
    localStorage.setItem(STORAGE_KEY, key);
  }
}

/** Clears the shared API key. */
export function clearApiKey() {
  apiKey.value = null;
  if (import.meta.client) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/** Masks a key for display (keeps a short tail, hides the rest). */
export function maskApiKey(key: string): string {
  if (key.length <= 8) {
    return '••••••••';
  }
  const tail = key.slice(-4);
  return `••••••••${tail}`;
}

export function useApiKey() {
  return { apiKey, setApiKey, clearApiKey, maskApiKey };
}
