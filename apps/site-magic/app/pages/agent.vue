<script setup lang="ts">
import { isTextUIPart, isToolUIPart, getToolName, DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { Chat } from '@ai-sdk/vue';

definePageMeta({
  layout: 'immersive',
  title:  'Agent',
});

const input = ref('');
const historyOpen = ref(false);

const { list: chatList, activeChatId, save, load, remove } = useChatHistory();

function createChat(messages: UIMessage[] = []) {
  return new Chat({
    transport: new DefaultChatTransport(),
    messages,
    onError(error) {
      console.error('Chat error:', error);
    },
    onFinish() {
      save(chat.id, chat.messages);
    },
  });
}

let chat = createChat();
activeChatId.value = chat.id;

// Version counter to trigger re-render when chat instance is swapped
const chatVersion = ref(0);

// These computed read from the Chat's own reactive state (not wrapped in shallowRef)
// chatVersion dependency ensures they refresh after chat instance swap
const chatMessages = computed(() => (chatVersion.value, chat.messages));
const chatStatus = computed(() => (chatVersion.value, chat.status));
const chatError = computed(() => (chatVersion.value, chat.error));

function onSubmit() {
  if (!input.value.trim()) return;

  chat.sendMessage({ text: input.value });
  input.value = '';
}

function swapChat(c: Chat<UIMessage>) {
  chat = c;
  chatVersion.value++;
}

function newChat() {
  // Save current before switching
  if (chat.messages.length > 0) {
    save(chat.id, chat.messages);
  }

  const c = createChat();
  swapChat(c);
  activeChatId.value = c.id;
  historyOpen.value = false;
}

function switchChat(id: string) {
  if (id === chat.id) {
    historyOpen.value = false;
    return;
  }

  // Save current before switching
  if (chat.messages.length > 0) {
    save(chat.id, chat.messages);
  }

  const messages = load(id);
  const c = createChat(messages);
  // Override the generated id with the history id
  Object.defineProperty(c, 'id', { value: id, writable: false });
  swapChat(c);
  activeChatId.value = id;
  historyOpen.value = false;
}

function deleteChat(id: string) {
  remove(id);
  if (id === chat.id) {
    const c = createChat();
    swapChat(c);
    activeChatId.value = c.id;
  }
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const toolLabels: Record<string, string> = {
  searchCards:     'Searching cards...',
  getCard:         'Getting card details...',
  getRuleSection:  'Looking up rules...',
  getRelatedCards: 'Finding related cards...',
};
</script>

<template>
  <div>
    <div class="relative h-[calc(100dvh-8rem)]">
        <!-- History button -->
        <div class="absolute top-2 right-2 z-10">
            <UButton
                icon="i-lucide-history"
                variant="ghost"
                size="sm"
                @click="historyOpen = true"
            />
            <UButton
                icon="i-lucide-plus"
                variant="ghost"
                size="sm"
                @click="newChat"
            />
        </div>

        <UChatPalette class="h-full rounded-lg bg-white dark:bg-neutral-900">
        <UChatMessages
            :messages="chatMessages"
            :status="chatStatus"
        >
            <template #content="{ message }">
                <template v-for="(part, index) in message.parts" :key="`${message.id}-${part.type}-${index}`">
                    <template v-if="isToolUIPart(part)">
                        <UChatTool
                            :text="toolLabels[getToolName(part)] ?? getToolName(part)"
                            :streaming="part.state !== 'output-available' && part.state !== 'output-error'"
                        />

                        <!-- Show search query and results -->
                        <div
                            v-if="getToolName(part) === 'searchCards' && part.state === 'output-available'"
                            class="mt-1 rounded-md bg-neutral-100 p-3 text-sm dark:bg-neutral-800"
                        >
                            <div class="text-neutral-500 dark:text-neutral-400">
                                Search: <code class="rounded bg-neutral-200 px-1 dark:bg-neutral-700">{{ (part as any).input?.query }}</code>
                            </div>
                            <div v-if="(part as any).output?.cards?.length" class="mt-2 flex flex-wrap gap-1.5">
                                <span
                                    v-for="card in (part as any).output.cards"
                                    :key="card.cardId"
                                    class="inline-block rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700 dark:bg-primary-900 dark:text-primary-300"
                                >
                                    {{ card.name }}
                                </span>
                            </div>
                            <div v-else class="mt-1 text-neutral-400">
                                No cards found.
                            </div>
                        </div>
                    </template>

                    <template v-else-if="isTextUIPart(part)">
                        <p v-if="message.role === 'user'" class="whitespace-pre-wrap">
                            {{ part.text }}
                        </p>
                        <RichText v-else :text="part.text" detect-url chat class="prose dark:prose-invert prose-sm max-w-none" />
                    </template>
                </template>
            </template>
        </UChatMessages>

        <template #prompt>
            <UChatPrompt
                v-model="input"
                :error="chatError"
                placeholder="Ask about Magic cards, rules, or game mechanics..."
                @submit="onSubmit"
            >
                <UChatPromptSubmit
                    :status="chatStatus"
                    @stop="chat.stop()"
                    @reload="chat.regenerate()"
                />
            </UChatPrompt>
        </template>
    </UChatPalette>
    </div>

    <!-- History slideover -->
    <USlideover v-model:open="historyOpen" side="left" title="Chat History">
        <template #body>
            <div class="flex flex-col gap-1">
                <button
                    v-for="entry in chatList"
                    :key="entry.id"
                    class="group flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors"
                    :class="entry.id === activeChatId
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'"
                    @click="switchChat(entry.id)"
                >
                    <div class="min-w-0 flex-1">
                        <div class="truncate">{{ entry.title }}</div>
                        <div class="text-xs text-neutral-400">{{ formatTime(entry.updatedAt) }}</div>
                    </div>
                    <UButton
                        icon="i-lucide-trash-2"
                        variant="ghost"
                        size="xs"
                        color="error"
                        class="opacity-0 group-hover:opacity-100"
                        @click.stop="deleteChat(entry.id)"
                    />
                </button>
                <div v-if="chatList.length === 0" class="px-3 py-6 text-center text-sm text-neutral-400">
                    No chat history yet.
                </div>
            </div>
        </template>
    </USlideover>
  </div>
</template>
