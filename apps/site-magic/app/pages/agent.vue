<script setup lang="ts">
import { isTextUIPart, isToolUIPart, getToolName, DefaultChatTransport } from 'ai';
import { Chat } from '@ai-sdk/vue';

definePageMeta({
  layout: 'immersive',
  title:  'Agent',
});

const input = ref('');

const chat = new Chat({
  transport: new DefaultChatTransport(),
  onError(error) {
    console.error('Chat error:', error);
  },
});

function onSubmit() {
  if (!input.value.trim()) return;

  chat.sendMessage({ text: input.value });
  input.value = '';
}

const toolLabels: Record<string, string> = {
  searchCards:    'Searching cards...',
  getCard:        'Getting card details...',
  getRuleSection: 'Looking up rules...',
};
</script>

<template>
    <UChatPalette class="h-[calc(100dvh-8rem)] rounded-lg bg-white dark:bg-neutral-900">
        <UChatMessages
            :messages="chat.messages"
            :status="chat.status"
        >
            <template #content="{ message }">
                <template v-for="(part, index) in message.parts" :key="`${message.id}-${part.type}-${index}`">
                    <UChatTool
                        v-if="isToolUIPart(part)"
                        :text="toolLabels[getToolName(part)] ?? getToolName(part)"
                        :streaming="part.state !== 'output-available' && part.state !== 'output-error'"
                    />

                    <template v-else-if="isTextUIPart(part)">
                        <p v-if="message.role === 'user'" class="whitespace-pre-wrap">
                            {{ part.text }}
                        </p>
                        <div v-else class="whitespace-pre-wrap">
                            {{ part.text }}
                        </div>
                    </template>
                </template>
            </template>
        </UChatMessages>

        <template #prompt>
            <UChatPrompt
                v-model="input"
                :error="chat.error"
                placeholder="Ask about Magic cards, rules, or game mechanics..."
                @submit="onSubmit"
            >
                <UChatPromptSubmit
                    :status="chat.status"
                    @stop="chat.stop()"
                    @reload="chat.regenerate()"
                />
            </UChatPrompt>
        </template>
    </UChatPalette>
</template>
