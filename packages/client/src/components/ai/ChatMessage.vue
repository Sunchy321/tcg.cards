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
                <milkdown-provider>
                    <markdown-renderer :content="message.content" :game="game" />
                </milkdown-provider>
            </div>

            <!-- Embedded cards -->
            <div v-if="message.cards && message.cards.length > 0" class="embedded-cards q-mt-md">
                <card-embed
                    v-for="(card, idx) in message.cards"
                    :key="`${card.cardId}-${idx}`"
                    :card-id="card.cardId"
                    :game="card.game"
                    :mode="card.mode"
                />
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

import CardEmbed from './CardEmbed.vue';
import MarkdownRenderer from './MarkdownRenderer.vue';
import { MilkdownProvider } from '@milkdown/vue';

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
    game:         string;
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
    :deep(p)
        margin: 0 0 8px 0

        &:last-child
            margin-bottom: 0

    :deep(code)
        background: rgba(0, 0, 0, 0.1)
        padding: 2px 6px
        border-radius: 4px
        font-family: 'Courier New', monospace
        font-size: 0.9em

    :deep(pre)
        background: rgba(0, 0, 0, 0.1)
        padding: 12px
        border-radius: 6px
        overflow-x: auto
        margin: 8px 0

        code
            background: none
            padding: 0

    :deep(.card-placeholder)
        color: #1976d2
        font-weight: 500
        background: rgba(25, 118, 210, 0.1)
        padding: 2px 8px
        border-radius: 4px

    :deep(strong)
        font-weight: 600

    :deep(em)
        font-style: italic

.message-text
    line-height: 1.6
    word-wrap: break-word

.embedded-cards
    display: flex
    flex-wrap: wrap
    gap: 12px

.typing-indicator
    display: flex
    gap: 4px

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
