import type { UIMessage } from 'ai';

interface ChatEntry {
  id:        string;
  title:     string;
  updatedAt: number;
}

const STORAGE_KEY_LIST = 'magic-agent-chats';
const MAX_HISTORY = 50;

function chatStorageKey(id: string) {
  return `magic-agent-chat-${id}`;
}

function loadList(): ChatEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LIST);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveList(list: ChatEntry[]) {
  localStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(list));
}

function loadMessages(id: string): UIMessage[] {
  try {
    const raw = localStorage.getItem(chatStorageKey(id));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMessages(id: string, messages: UIMessage[]) {
  localStorage.setItem(chatStorageKey(id), JSON.stringify(messages));
}

function titleFromMessages(messages: UIMessage[]): string {
  const first = messages.find(m => m.role === 'user');
  if (!first) return 'New chat';

  const textPart = first.parts.find(p => p.type === 'text');
  const text = textPart && 'text' in textPart ? textPart.text : '';
  return text.slice(0, 60) || 'New chat';
}

export function useChatHistory() {
  const list = ref<ChatEntry[]>(loadList());
  const activeChatId = ref<string | null>(null);

  function save(id: string, messages: UIMessage[]) {
    if (messages.length === 0) return;

    saveMessages(id, messages);

    const title = titleFromMessages(messages);
    const idx = list.value.findIndex(e => e.id === id);

    if (idx >= 0) {
      list.value[idx] = { id, title, updatedAt: Date.now() };
    } else {
      list.value.unshift({ id, title, updatedAt: Date.now() });
    }

    // Trim old entries
    while (list.value.length > MAX_HISTORY) {
      const removed = list.value.pop()!;
      localStorage.removeItem(chatStorageKey(removed.id));
    }

    saveList(list.value);
  }

  function load(id: string): UIMessage[] {
    return loadMessages(id);
  }

  function remove(id: string) {
    list.value = list.value.filter(e => e.id !== id);
    localStorage.removeItem(chatStorageKey(id));
    saveList(list.value);
  }

  return { list, activeChatId, save, load, remove };
}
