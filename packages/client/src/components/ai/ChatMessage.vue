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
            <!-- Use component instead of v-html to prevent XSS -->
            <div class="message-text">
                <rendered-markdown :content="message.content" />
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
import { computed, h } from 'vue';

import CardEmbed from './CardEmbed.vue';

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

// Safe Markdown rendering component
const RenderedMarkdown = {
    props: {
        content: String,
    },
    setup(props: { content: string }) {
        // Escape HTML tags to prevent injection
        const escapeHtml = (text: string) => {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };

        // Parse and render Markdown function
        const parseMarkdown = (text: string) => {
            const elements: any[] = [];
            let currentText = text;

            // Replace card placeholders
            const cardPlaceholderRegex = /\{\{CARD:([^}]+)\}\}/g;
            const parts = currentText.split(cardPlaceholderRegex);

            parts.forEach((part, index) => {
                if (index % 2 === 0) {
                    // Plain text, process Markdown
                    if (part) {
                        elements.push(...parseTextWithMarkdown(part));
                    }
                } else {
                    // Card placeholder
                    elements.push(
                        h('span', { class: 'card-placeholder' }, `[${part}]`),
                    );
                }
            });

            return elements;
        };

        const parseTextWithMarkdown = (text: string) => {
            const elements: any[] = [];
            const lines = text.split('\n');

            lines.forEach((line, lineIndex) => {
                if (lineIndex > 0) {
                    elements.push(h('br'));
                }

                // Parse inline elements
                const inlineElements = parseInline(line);
                elements.push(...inlineElements);
            });

            return elements;
        };

        const parseInline = (text: string) => {
            const elements: any[] = [];
            let remaining = text;
            let lastIndex = 0;

            // Match **bold**, *italic*, `code`
            const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
            let match;

            while ((match = regex.exec(remaining)) !== null) {
                // Add plain text before match
                if (match.index > lastIndex) {
                    const plainText = remaining.slice(lastIndex, match.index);
                    if (plainText) {
                        elements.push(escapeHtml(plainText));
                    }
                }

                // Process matched format
                if (match[2]) {
                    // Bold **text**
                    elements.push(h('strong', escapeHtml(match[2])));
                } else if (match[3]) {
                    // Italic *text*
                    elements.push(h('em', escapeHtml(match[3])));
                } else if (match[4]) {
                    // Code `text`
                    elements.push(h('code', escapeHtml(match[4])));
                }

                lastIndex = regex.lastIndex;
            }

            // Add remaining plain text
            if (lastIndex < remaining.length) {
                const plainText = remaining.slice(lastIndex);
                if (plainText) {
                    elements.push(escapeHtml(plainText));
                }
            }

            return elements.length > 0 ? elements : [escapeHtml(text)];
        };

        return () => h('div', { class: 'rendered-markdown' }, parseMarkdown(props.content));
    },
};

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
