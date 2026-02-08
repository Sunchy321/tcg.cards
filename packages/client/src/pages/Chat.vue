<template>
    <q-page class="ai-search-page q-pa-md">
        <q-card class="chat-container" flat bordered>
            <q-card-section ref="messagesContainer" class="chat-messages">
                <div v-if="messages.length === 0" class="welcome-message">
                    <q-icon name="mdi-robot" size="64px" color="primary" />
                    <h5>{{ $t('ui.ai.welcome-title') }}</h5>
                    <p>{{ $t('ui.ai.welcome-intro') }}</p>
                    <ul>
                        <li>{{ $t('ui.ai.feature-convert') }}</li>
                        <li>{{ $t('ui.ai.feature-recommend') }}</li>
                        <li>{{ $t('ui.ai.feature-synergy') }}</li>
                        <li>{{ $t('ui.ai.feature-deck') }}</li>
                    </ul>
                </div>

                <chat-message
                    v-for="(msg, idx) in messages"
                    :key="idx"
                    :message="msg"
                    :is-streaming="idx === messages.length - 1 && isStreaming"
                />
            </q-card-section>

            <q-separator />

            <q-card-section class="input-area">
                <div class="quick-actions q-mb-sm">
                    <q-btn
                        v-for="action in quickActions"
                        :key="action.label"
                        :label="action.label"
                        size="sm"
                        flat
                        dense
                        @click="handleQuickAction(action.query)"
                    />
                </div>

                <div class="input-row">
                    <q-input
                        v-model="userInput"
                        outlined
                        :placeholder="$t('ui.ai.input-placeholder')"
                        :disable="isLoading"
                        class="flex-1"
                        @keyup.enter="sendMessage"
                    >
                        <template #prepend>
                            <q-icon name="mdi-message-text" />
                        </template>
                    </q-input>

                    <q-btn
                        icon="mdi-send"
                        color="primary"
                        :disable="!userInput.trim() || isLoading"
                        :loading="isLoading"
                        @click="sendMessage"
                    />

                    <q-btn
                        icon="mdi-refresh"
                        flat
                        :disable="messages.length === 0"
                        @click="clearChat"
                    >
                        <q-tooltip>{{ $t('ui.ai.clear-chat') }}</q-tooltip>
                    </q-btn>
                </div>

                <div v-if="lastConversion" class="conversion-info q-mt-sm">
                    <q-banner dense class="bg-info text-white">
                        <template #avatar>
                            <q-icon name="mdi-information" />
                        </template>
                        <div class="text-caption">
                            <strong>{{ $t('ui.ai.search-syntax') }}:</strong> <code>{{ lastConversion.syntax }}</code>
                        </div>
                        <div class="text-caption">
                            {{ lastConversion.explanation }}
                        </div>
                        <template #action>
                            <q-btn
                                flat
                                dense
                                :label="$t('ui.ai.execute-search')"
                                @click="executeSearch(lastConversion.syntax)"
                            />
                        </template>
                    </q-banner>
                </div>
            </q-card-section>
        </q-card>
    </q-page>
</template>

<script setup lang="ts">
import { ref, nextTick, computed } from 'vue';

import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useCore, useTitle } from 'store/core';

import ChatMessage from '@/components/ai/ChatMessage.vue';

import { trpc } from 'src/trpc';

interface Message {
    role:    'user' | 'assistant' | 'system';
    content: string;
    cards?: {
        cardId: string;
        mode:   'image' | 'text' | 'compact';
        game:   string;
    }[];
}

const router = useRouter();
const i18n = useI18n();
const core = useCore();

useTitle(() => i18n.t('ui.ai.chat'));

const messages = ref<Message[]>([]);
const userInput = ref('');
const isLoading = ref(false);
const isStreaming = ref(false);
const messagesContainer = ref<HTMLElement>();
const lastConversion = ref<{
    syntax:      string;
    explanation: string;
} | null>(null);

const quickActions = computed(() => {
    const actions: Record<string, { label: string, query: string }[]> = {
        magic: [
            {
                label: i18n.t('ui.ai.quick-action.magic.blue-instant'),
                query: i18n.t('ui.ai.quick-action.magic.blue-instant-q'),
            },
            {
                label: i18n.t('ui.ai.quick-action.magic.removal'),
                query: i18n.t('ui.ai.quick-action.magic.removal-q'),
            },
            {
                label: i18n.t('ui.ai.quick-action.magic.commander'),
                query: i18n.t('ui.ai.quick-action.magic.commander-q'),
            },
        ],
        yugioh: [
            {
                label: i18n.t('ui.ai.quick-action.yugioh.lv4-dark'),
                query: i18n.t('ui.ai.quick-action.yugioh.lv4-dark-q'),
            },
            {
                label: i18n.t('ui.ai.quick-action.yugioh.removal'),
                query: i18n.t('ui.ai.quick-action.yugioh.removal-q'),
            },
            {
                label: i18n.t('ui.ai.quick-action.yugioh.handtrap'),
                query: i18n.t('ui.ai.quick-action.yugioh.handtrap-q'),
            },
        ],
        hearthstone: [
            {
                label: i18n.t('ui.ai.quick-action.hearthstone.mage-spell'),
                query: i18n.t('ui.ai.quick-action.hearthstone.mage-spell-q'),
            },
            {
                label: i18n.t('ui.ai.quick-action.hearthstone.minion-3'),
                query: i18n.t('ui.ai.quick-action.hearthstone.minion-3-q'),
            },
            {
                label: i18n.t('ui.ai.quick-action.hearthstone.draw'),
                query: i18n.t('ui.ai.quick-action.hearthstone.draw-q'),
            },
        ],
    };

    return actions[core.game ?? ''] ?? [];
});

const scrollToBottom = () => {
    nextTick(() => {
        if (messagesContainer.value) {
            messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
        }
    });
};

const handleQuickAction = (query: string) => {
    userInput.value = query;
    sendMessage();
};

const sendMessage = async () => {
    if (core.game == null) {
        return;
    }

    if (userInput.value.trim() === '' || isLoading.value) {
        return;
    }

    const userMessage = userInput.value.trim();
    userInput.value = '';

    // Add user message
    messages.value.push({
        role:    'user',
        content: userMessage,
    });

    scrollToBottom();

    isLoading.value = true;

    try {
        // Try to convert query
        if (userMessage.includes('搜索') || userMessage.includes('找') || userMessage.includes('推荐')) {
            const conversion = await trpc.ai.convert({
                game:  core.game,
                query: userMessage,
            });

            lastConversion.value = conversion;
        }

        // Send chat request
        const response = await trpc.ai.chat({
            game:    core.game,
            message: userMessage,
            history: messages.value.slice(0, -1).map(m => ({
                role:    m.role,
                content: m.content,
            })),
        });

        // Add AI response
        messages.value.push({
            role:    'assistant',
            content: response.response,
            cards:   response.cards,
        });

        scrollToBottom();
    } catch (error) {
        console.error('Chat error:', error);

        messages.value.push({
            role:    'assistant',
            content: i18n.t('ui.ai.error-message'),
        });
    } finally {
        isLoading.value = false;
    }
};

const executeSearch = (syntax: string) => {
    router.push({
        name:  `${core.game}/search`,
        query: { q: syntax },
    });
};

const clearChat = () => {
    messages.value = [];
    lastConversion.value = null;
};
</script>

<style lang="sass" scoped>
.ai-search-page
    max-width: 1200px
    margin: 0 auto

.page-header
    display: flex
    justify-content: space-between
    align-items: center
    margin-bottom: 16px

    h4
        margin: 0

.chat-container
    height: calc(100vh - 200px)
    display: flex
    flex-direction: column

.chat-messages
    flex: 1
    overflow-y: auto
    padding: 16px

.welcome-message
    text-align: center
    padding: 48px 16px
    color: #666

    h5
        margin: 16px 0 8px

    p
        margin: 16px 0 8px

    ul
        list-style: none
        padding: 0
        text-align: left
        display: inline-block

        li
            padding: 8px 0
            &:before
                content: "✓ "
                color: #1976d2
                font-weight: bold
                margin-right: 8px

.input-area
    padding: 16px

.quick-actions
    display: flex
    gap: 8px
    flex-wrap: wrap

.input-row
    display: flex
    gap: 8px
    align-items: center

    .flex-1
        flex: 1

.conversion-info
    code
        background: rgba(255, 255, 255, 0.2)
        padding: 2px 6px
        border-radius: 4px
        font-family: 'Courier New', monospace
</style>
