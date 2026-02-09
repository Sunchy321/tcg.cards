<template>
    <q-chat-message
        :sent="message.role === 'user'"
        :bg-color="bgColor"
        :text-color="textColor"
    >
        <template #avatar>
            <q-avatar :color="avatarColor" text-color="white">
                <q-icon :name="avatarIcon" />
            </q-avatar>
        </template>

        <div class="message-content">
            <!-- Use Milkdown for Markdown rendering -->
            <div class="message-text">
                <markdown-renderer :content="message.content" :game="game" />
            </div>

            <div v-if="isStreaming" class="typing-indicator q-mt-sm">
                <span />
                <span />
                <span />
            </div>
        </div>
    </q-chat-message>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import MarkdownRenderer from './MarkdownRenderer.vue';

interface CardEmbedData {
    cardId: string;
    mode:   'image' | 'text' | 'compact';
    game:   string;
}

interface ChatMessage {
    role:    'user' | 'assistant' | 'system';
    content: string;
    cards?:  CardEmbedData[];
}

const props = defineProps<{
    message:      ChatMessage;
    game?:        string;
    isStreaming?: boolean;
}>();

const avatarColor = computed(() => {
    return props.message.role === 'user' ? 'primary' : 'secondary';
});

const avatarIcon = computed(() => {
    return props.message.role === 'user' ? 'mdi-account' : 'mdi-robot';
});

const bgColor = computed(() => {
    return props.message.role === 'user' ? 'primary' : 'grey-3';
});

const textColor = computed(() => {
    return props.message.role === 'user' ? 'white' : 'dark';
});

</script>

<style lang="sass" scoped>
.message-content
    font-size: 14px

.message-text
    line-height: 1.7
    word-wrap: break-word

.typing-indicator
    display: flex
    gap: 4px
    margin-top: 8px

    span
        width: 8px
        height: 8px
        border-radius: 50%
        background: currentColor
        opacity: 0.4
        animation: typing 1.4s infinite

        &:nth-child(2)
            animation-delay: 0.2s

        &:nth-child(3)
            animation-delay: 0.4s

@keyframes typing
    0%, 60%, 100%
        opacity: 0.4
        transform: translateY(0)

    30%
        opacity: 1
        transform: translateY(-10px)
</style>
