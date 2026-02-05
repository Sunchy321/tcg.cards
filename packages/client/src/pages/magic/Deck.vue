<template>
    <q-page class="q-pa-md">
        <div v-if="loading" class="row q-col-gutter-md">
            <div class="col-12">
                <!-- <q-skeleton height="200px" /> -->
            </div>
        </div>

        <!-- View Mode -->
        <div v-else-if="deck" class="row q-col-gutter-md">
            <!-- Deck Header -->
            <div class="col-12">
                <q-card flat bordered>
                    <q-card-section>
                        <div class="row items-center justify-between">
                            <div class="col-grow">
                                <div class="row">
                                    <div v-if="!editingName" class="row items-center q-gutter-sm">
                                        <div class="text-h4">{{ deck.name }}</div>
                                        <q-btn
                                            v-if="isOwner"
                                            flat dense round
                                            icon="mdi-pencil"
                                            @click="startEditName"
                                        />
                                    </div>
                                    <div v-else class="row items-center q-gutter-sm">
                                        <q-input
                                            v-model="editNameValue"
                                            class="text-h4"
                                            style="min-width: 300px"
                                            outlined dense
                                            autofocus
                                            @keyup.enter="saveName"
                                            @keyup.esc="cancelEditName"
                                        />
                                        <q-btn flat dense round size="sm" icon="mdi-check-circle" color="positive" @click="saveName" />
                                        <q-btn flat dense round size="sm" icon="mdi-close-circle" color="negative" @click="cancelEditName" />
                                    </div>
                                    <div class="q-space" />
                                    <div class="row q-gutter-sm">
                                        <!-- TODO: Remember to delete this debug button -->
                                        <q-btn
                                            outline
                                            color="warning"
                                            icon="mdi-bug"
                                            :label="`Debug: ${debugIsOwner === undefined ? 'Auto' : debugIsOwner ? 'Owner' : 'Guest'}`"
                                            @click="debugToggleOwner"
                                        />
                                        <q-btn
                                            v-if="isOwner"
                                            outline
                                            color="negative"
                                            icon="mdi-delete"
                                            :label="$t('common.delete')"
                                            @click="confirmDelete"
                                        />
                                    </div>
                                </div>
                                <div class="q-mt-sm text-subtitle2 text-grey-7 row items-center q-gutter-sm">
                                    <q-select
                                        v-if="isOwner"
                                        v-model="deck.format"
                                        class="q-my-none"
                                        :options="formatOptions"
                                        emit-value map-options
                                        borderless dense
                                        :display-value="$t(`magic.format.${deck.format}`)"
                                        @update:model-value="saveFormat"
                                    />
                                    <div v-else>{{ $t(`magic.format.${deck.format}`) }}</div>
                                    <div>• {{ deck.userName }}</div>
                                </div>
                            </div>
                        </div>

                        <div class="q-mt-md">
                            <div v-if="!editingDescription && deck.description" class="row items-start q-gutter-sm">
                                <div class="col-grow">{{ deck.description }}</div>
                                <q-btn
                                    v-if="isOwner"
                                    flat dense round
                                    size="sm"
                                    icon="mdi-receipt-text-edit"
                                    @click="startEditDescription"
                                />
                            </div>
                            <div v-else-if="!editingDescription && !deck.description && isOwner" class="row items-center q-gutter-sm">
                                <div class="text-grey-6">{{ $t('magic.ui.deck.no-description') }}</div>
                                <q-btn
                                    flat dense round
                                    size="sm"
                                    icon="mdi-receipt-text-edit"
                                    @click="startEditDescription"
                                />
                            </div>
                            <div v-else-if="editingDescription" class="row items-start q-gutter-sm">
                                <q-input
                                    v-model="editDescriptionValue"
                                    type="textarea"
                                    class="col-grow"
                                    :rows="3"
                                    autofocus
                                    outlined dense
                                    @keyup.esc="cancelEditDescription"
                                />
                                <div class="column q-gutter-xs">
                                    <q-btn flat dense round size="sm" icon="mdi-check-circle" color="positive" @click="saveDescription" />
                                    <q-btn flat dense round size="sm" icon="mdi-close-circle" color="negative" @click="cancelEditDescription" />
                                </div>
                            </div>
                        </div>

                        <div v-if="deck.tags.length > 0" class="q-mt-md">
                            <q-chip
                                v-for="tag in deck.tags"
                                :key="tag"
                                color="primary"
                                text-color="white"
                            >
                                {{ tag }}
                            </q-chip>
                        </div>

                        <div class="row q-mt-md q-gutter-md text-grey-7">
                            <div>
                                <q-icon name="mdi-eye" />
                                {{ deck.views }} {{ $t('magic.ui.deck.views') }}
                            </div>
                            <div>
                                <q-icon name="mdi-update" />
                                {{ $t('magic.ui.deck.updated') }} {{ formatDate(deck.updatedAt) }}
                            </div>
                            <div
                                :class="[
                                    !isOwner && user ? 'cursor-pointer' : '',
                                    deck.isLiked ? 'text-red' : ''
                                ]"
                                @click="!isOwner && user ? toggleLike() : undefined"
                            >
                                <q-icon :name="deck.isLiked ? 'mdi-heart' : 'mdi-heart-outline'" />
                                {{ deck.likes }}
                            </div>
                            <div
                                :class="[
                                    !isOwner && user ? 'cursor-pointer' : '',
                                    deck.isFavorite ? 'text-amber' : ''
                                ]"
                                @click="!isOwner && user ? toggleFavorite() : undefined"
                            >
                                <q-icon :name="deck.isFavorite ? 'mdi-star' : 'mdi-star-outline'" />
                                {{ deck.favorites }}
                            </div>
                        </div>
                    </q-card-section>
                </q-card>
            </div>

            <!-- Card Lists -->
            <div class="col-12">
                <!-- Toolbar -->
                <q-toolbar class="bg-grey-2 q-mb-md col-grow" style="position: sticky; top: 50px; z-index: 1;">
                    <q-select
                        v-model="viewMode"
                        :options="viewModeOptions"
                        emit-value map-options
                        dense outlined
                        style="min-width: 150px"
                    >
                        <template #prepend>
                            <q-icon :name="viewModeIcon" />
                        </template>
                    </q-select>

                    <q-select
                        v-if="viewMode === 'code'"
                        v-model="codeFormat"
                        :options="codeFormatOptions"
                        emit-value map-options
                        dense outlined
                        style="min-width: 100px"
                        class="q-ml-sm"
                    />

                    <q-select
                        v-if="viewMode !== 'code'"
                        v-model="groupMode"
                        :options="groupModeOptions"
                        emit-value map-options
                        dense outlined
                        style="min-width: 150px"
                        class="q-ml-sm"
                    >
                        <template #prepend>
                            <q-icon :name="groupModeIcon" />
                        </template>
                    </q-select>

                    <q-select
                        v-if="viewMode !== 'code'"
                        v-model="sortMode"
                        :options="sortModeOptions"
                        emit-value map-options
                        dense outlined
                        style="min-width: 150px"
                        class="q-ml-sm"
                    >
                        <template #prepend>
                            <q-icon :name="sortModeIcon" />
                        </template>
                    </q-select>

                    <q-space />

                    <q-btn
                        v-if="isOwner"
                        flat dense
                        icon="mdi-code-braces"
                        :label="$t('magic.ui.deck.import-export')"
                        @click="showCodeDialog = true"
                    />

                    <q-select
                        v-if="isOwner"
                        v-model="selectedCard"
                        :options="searchResult"
                        use-input
                        input-debounce="300"
                        :placeholder="$t('magic.ui.deck.search-card')"
                        dense outlined
                        clearable
                        style="min-width: 300px"
                        class="q-mr-sm"
                        @filter="filterCards"
                        @update:model-value="handleCardSelect"
                    >
                        <template #append>
                            <q-icon name="mdi-magnify" />
                        </template>
                        <template #no-option>
                            <q-item>
                                <q-item-section class="text-grey">
                                    {{ searchInput ? $t('magic.ui.deck.no-results') : $t('magic.ui.deck.type-to-search') }}
                                </q-item-section>
                            </q-item>
                        </template>
                        <template #option="{ itemProps, opt }">
                            <q-item v-bind="itemProps">
                                <q-item-section>
                                    <q-item-label>{{ opt.cardLocalization.name }}</q-item-label>
                                    <!-- <q-item-label caption>{{ opt.card.name }}</q-item-label> -->
                                </q-item-section>
                            </q-item>
                        </template>
                    </q-select>
                </q-toolbar>

                <!-- Text Mode -->
                <template v-if="viewMode === 'text'">
                    <q-card
                        v-for="(section, sectionIndex) in allDeckGroups"
                        :key="`${section.category}-${sectionIndex}`"
                        flat bordered
                        :class="sectionIndex < allDeckGroups.length - 1 ? 'q-mb-md' : ''"
                    >
                        <q-card-section>
                            <div class="text-h6">{{ section.title }} ({{ section.count }})</div>
                        </q-card-section>
                        <q-separator />
                        <q-card-section>
                            <div class="row">
                                <div v-for="col in 3" :key="col" class="col-4">
                                    <div v-for="(card) in getColumnCards(section.cards, col, 3)" :key="card.cardId" class="row items-center q-mb-sm">
                                        <div class="col-3 text-right q-pr-sm">{{ card.quantity }}x</div>
                                        <div class="col">
                                            <card-avatar :id="card.cardId" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </q-card-section>
                    </q-card>
                </template>

                <!-- Image Mode -->
                <template v-else-if="viewMode === 'image'">
                    <q-card
                        v-for="(section, sectionIndex) in allDeckGroups"
                        :key="`${section.category}-${sectionIndex}`"
                        flat bordered
                        :class="sectionIndex < allDeckGroups.length - 1 ? 'q-mb-md' : ''"
                    >
                        <q-card-section>
                            <div class="text-h6">{{ section.title }} ({{ section.count }})</div>
                        </q-card-section>
                        <q-separator />
                        <q-card-section>
                            <div class="row q-col-gutter-sm">
                                <div v-for="card in section.cards" :key="card.cardId" class="col-auto" style="position: relative; width: 150px">
                                    <card-avatar :id="card.cardId" hide-text />
                                    <div v-if="card.quantity > 1" class="absolute-top-right q-ma-xs">
                                        <q-badge color="primary" rounded>{{ card.quantity }}</q-badge>
                                    </div>
                                </div>
                            </div>
                        </q-card-section>
                    </q-card>
                </template>

                <!-- Code Mode -->
                <template v-else-if="viewMode === 'code'">
                    <q-card flat bordered>
                        <q-card-section>
                            <div class="text-h6">{{ $t('magic.ui.deck.deck-code') }}</div>
                        </q-card-section>
                        <q-separator />
                        <q-card-section>
                            <code-editor
                                v-model="deckCodeText"
                                :readonly="!isOwner"
                            />
                            <div v-if="isOwner" class="q-mt-md row q-gutter-sm">
                                <q-btn
                                    flat
                                    color="primary"
                                    :label="$t('magic.ui.deck.apply-code')"
                                    @click="applyDeckCode"
                                />
                                <q-btn
                                    flat
                                    color="secondary"
                                    :label="$t('magic.ui.deck.reset-code')"
                                    @click="generateDeckCode"
                                />
                            </div>
                        </q-card-section>
                    </q-card>
                </template>
            </div>
        </div>

        <div v-else class="text-center q-pa-lg text-grey-6">
            {{ $t('magic.ui.deck.deck-not-found') }}
        </div>

        <!-- Delete Confirmation Dialog -->
        <q-dialog v-model="showDeleteDialog">
            <q-card>
                <q-card-section>
                    <div class="text-h6">{{ $t('magic.ui.deck.confirm-delete') }}</div>
                </q-card-section>
                <q-card-section>
                    {{ $t('magic.ui.deck.delete-warning') }}
                </q-card-section>
                <q-card-actions align="right">
                    <q-btn v-close-popup flat :label="$t('common.cancel')" color="primary" />
                    <q-btn flat :label="$t('common.delete')" color="negative" @click="deleteDeck" />
                </q-card-actions>
            </q-card>
        </q-dialog>

        <!-- Import/Export Code Dialog -->
        <q-dialog v-model="showCodeDialog">
            <q-card style="min-width: 600px; max-width: 800px">
                <q-card-section>
                    <div class="text-h6">{{ $t('magic.ui.deck.deck-code') }}</div>
                </q-card-section>
                <q-card-section>
                    <q-input
                        v-model="deckCodeText"
                        type="textarea"
                        :placeholder="$t('magic.ui.deck.deck-code-placeholder')"
                        outlined
                        autogrow
                        :rows="15"
                        class="q-mb-md"
                    />
                    <div class="text-caption text-grey-7">
                        {{ $t('magic.ui.deck.deck-code-format') }}
                    </div>
                </q-card-section>
                <q-card-actions align="right">
                    <q-btn flat :label="$t('common.cancel')" color="primary" @click="cancelCodeEdit" />
                    <q-btn flat :label="$t('magic.ui.deck.export-code')" color="primary" @click="exportDeckCode" />
                    <q-btn flat :label="$t('magic.ui.deck.import-code')" color="positive" @click="importDeckCode" />
                </q-card-actions>
            </q-card>
        </q-dialog>

        <!-- Legality Check Dialog -->
        <q-dialog v-model="showLegalityDialog">
            <q-card style="min-width: 400px">
                <q-card-section>
                    <div class="text-h6">{{ $t('magic.ui.deck.legality-check') }}</div>
                </q-card-section>
                <q-card-section v-if="legalityResult">
                    <div class="q-mb-md">
                        <div class="text-subtitle1">
                            {{ $t(`magic.format.${legalityResult.format}`) }}:
                            <q-chip
                                :color="legalityResult.legal ? 'positive' : 'negative'"
                                text-color="white"
                                size="sm"
                            >
                                {{ legalityResult.legal ? $t('magic.ui.deck.legal') : $t('magic.ui.deck.not-legal') }}
                            </q-chip>
                        </div>
                    </div>
                    <div v-if="!legalityResult.legal && legalityResult.issues.length > 0">
                        <div class="text-subtitle2 q-mb-sm">{{ $t('magic.ui.deck.issues') }}:</div>
                        <q-list bordered separator>
                            <q-item v-for="issue in legalityResult.issues" :key="`${issue.cardId}-${issue.reason}`">
                                <q-item-section>
                                    <q-item-label>{{ issue.cardName }}</q-item-label>
                                    <q-item-label caption>
                                        <template v-if="issue.reason === 'banned'">
                                            {{ $t('magic.ui.deck.issue-banned') }}
                                        </template>
                                        <template v-else-if="issue.reason === 'restricted'">
                                            {{ $t('magic.ui.deck.issue-restricted', { limit: issue.limit, current: issue.current }) }}
                                        </template>
                                        <template v-else-if="issue.reason === 'not-legal'">
                                            {{ $t('magic.ui.deck.issue-not-legal') }}
                                        </template>
                                        <template v-else-if="issue.reason === 'too-many-copies'">
                                            {{ $t('magic.ui.deck.issue-too-many', { limit: issue.limit, current: issue.current }) }}
                                        </template>
                                        <template v-else-if="issue.reason === 'invalid-deck-size'">
                                            {{ $t('magic.ui.deck.issue-invalid-deck-size', { limit: issue.limit, current: issue.current }) }}
                                        </template>
                                        <template v-else-if="issue.reason === 'invalid-commander-count'">
                                            {{ $t('magic.ui.deck.issue-invalid-commander-count', { limit: issue.limit, current: issue.current }) }}
                                        </template>
                                    </q-item-label>
                                </q-item-section>
                            </q-item>
                        </q-list>
                    </div>
                </q-card-section>
                <q-card-section v-else>
                    <q-spinner color="primary" size="3em" />
                </q-card-section>
                <q-card-actions align="right">
                    <q-btn v-close-popup flat :label="$t('common.close')" color="primary" />
                </q-card-actions>
            </q-card>
        </q-dialog>

        <!-- Sticky Legality Footer -->
        <q-footer
            v-if="legalityResult && deck"
            class="bg-white text-dark"
            bordered
        >
            <q-toolbar>
                <q-toolbar-title class="row items-center q-gutter-md">
                    <div class="text-subtitle1">
                        {{ $t(`magic.format.${legalityResult.format}`) }}
                    </div>
                    <q-chip
                        :color="legalityResult.legal ? 'positive' : 'negative'"
                        :icon="legalityResult.legal ? 'mdi-check-circle' : 'mdi-alert-circle'"
                        text-color="white"
                        clickable
                        @click="showLegalityDialog = true"
                    >
                        {{ legalityResult.legal ? $t('magic.ui.deck.legal') : $t('magic.ui.deck.not-legal') }}
                    </q-chip>
                    <div v-if="!legalityResult.legal" class="text-caption text-grey-7">
                        {{ $t('magic.ui.deck.issues-count', { count: legalityResult.issues.length }) }}
                    </div>
                </q-toolbar-title>
            </q-toolbar>
        </q-footer>
    </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';

import { useRoute, useRouter } from 'vue-router';
import { useQuasar, date as dateUtil } from 'quasar';
import { useI18n } from 'vue-i18n';

import CardAvatar from 'components/magic/CardAvatar.vue';
import CodeEditor from 'components/magic/CodeEditor.vue';

import { DeckView } from '@model/magic/schema/deck';
import { NormalResult } from '@model/magic/schema/search';

import { trpc } from 'src/trpc';
import { auth } from 'src/auth';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const { t: $t } = useI18n();
const session = auth.useSession();

// User (would come from auth store)
const user = computed(() => session.value?.data?.user ?? null);
const userId = computed(() => user.value?.id);

// Data
const deck = ref<DeckView>();

const loading = ref(false);
const showDeleteDialog = ref(false);
const showLegalityDialog = ref(false);
const editingName = ref(false);
const editNameValue = ref('');
const editingDescription = ref(false);
const editDescriptionValue = ref('');
const showCodeDialog = ref(false);
const deckCodeText = ref('');

const getStorageKey = (key: string) => {
    const deckId = route.params.deckId as string;
    return `magic.deck.${deckId}.${key}`;
};

// Code format type
type CodeFormat = 'mtgo' | 'mtga';
const codeFormat = ref<CodeFormat>((localStorage.getItem(getStorageKey('codeFormat')) as CodeFormat) ?? 'mtgo');
const codeFormatOptions = [
    { label: 'MTGO', value: 'mtgo' },
    { label: 'MTGA', value: 'mtga' },
];

watch(codeFormat, newValue => {
    localStorage.setItem(getStorageKey('codeFormat'), newValue);
});

// Card search and add
const searchInput = ref('');
const searchResult = ref<NormalResult['result']>([]);
const selectedCard = ref<NormalResult['result'][0] | null>(null);

// Legality check
const legalityResult = ref<{
    format: string;
    legal:  boolean;
    issues: {
        cardId:   string;
        cardName: string;
        reason:   string;
        limit?:   number;
        current?: number;
    }[];
} | null>(null);

// View mode
type ViewMode = 'text' | 'image' | 'code';

const viewMode = ref<ViewMode>((localStorage.getItem(getStorageKey('viewMode')) as ViewMode) ?? 'text');

const viewModeOptions = [
    { label: $t('magic.ui.deck.view-text'), value: 'text', icon: 'mdi-format-list-bulleted' },
    { label: $t('magic.ui.deck.view-image'), value: 'image', icon: 'mdi-image-multiple' },
    { label: $t('magic.ui.deck.view-code'), value: 'code', icon: 'mdi-code-braces' },
];

const viewModeIcon = computed(() => viewModeOptions.find(v => v.value === viewMode.value)!.icon);

watch(viewMode, newValue => {
    localStorage.setItem(getStorageKey('viewMode'), newValue);
});

// Group mode
type GroupMode = 'category' | 'type' | 'cost' | 'color';

const groupMode = ref<GroupMode>((localStorage.getItem(getStorageKey('groupMode')) as GroupMode) ?? 'category');

const groupModeOptions = [
    { label: $t('magic.ui.deck.group-category'), value: 'category', icon: 'mdi-folder-outline' },
    { label: $t('magic.ui.deck.group-type'), value: 'type', icon: 'mdi-shape-outline' },
    { label: $t('magic.ui.deck.group-cost'), value: 'cost', icon: 'mdi-currency-usd' },
    { label: $t('magic.ui.deck.group-color'), value: 'color', icon: 'mdi-palette-outline' },
];

const groupModeIcon = computed(() => groupModeOptions.find(g => g.value === groupMode.value)!.icon);

watch(groupMode, newValue => {
    localStorage.setItem(getStorageKey('groupMode'), newValue);
});

// Sort mode
type SortMode = 'name' | 'cost' | 'color' | 'type' | 'rarity';

const sortMode = ref<SortMode>((localStorage.getItem(getStorageKey('sortMode')) as SortMode) ?? 'name');

const sortModeOptions = [
    { label: $t('magic.ui.deck.sort-name'), value: 'name', icon: 'mdi-sort-alphabetical-ascending' },
    { label: $t('magic.ui.deck.sort-cost'), value: 'cost', icon: 'mdi-sort-numeric-ascending' },
    { label: $t('magic.ui.deck.sort-color'), value: 'color', icon: 'mdi-palette' },
    { label: $t('magic.ui.deck.sort-type'), value: 'type', icon: 'mdi-shape' },
    { label: $t('magic.ui.deck.sort-rarity'), value: 'rarity', icon: 'mdi-diamond-stone' },
];

const sortModeIcon = computed(() => sortModeOptions.find(s => s.value === sortMode.value)!.icon);

watch(sortMode, newValue => {
    localStorage.setItem(getStorageKey('sortMode'), newValue);
});

// Watch for code generation triggers
watch([deck, viewMode, codeFormat], () => {
    if (deck.value && viewMode.value === 'code') {
        generateDeckCode();
    }
});

// TODO: Remember to delete this debug state
const debugIsOwner = ref<boolean>();

// Computed
const isOwner = computed(() => {
    if (debugIsOwner.value != null) return debugIsOwner.value;
    return deck.value && userId.value === deck.value.userId;
});

const mainDeckCards = computed(() =>
    deck.value?.cards.filter(c => c.category === 'main') || [],
);
const sideboardCards = computed(() =>
    deck.value?.cards.filter(c => c.category === 'sideboard') || [],
);
const commanderCards = computed(() =>
    deck.value?.cards.filter(c => c.category === 'commander') || [],
);
const companionCards = computed(() =>
    deck.value?.cards.filter(c => c.category === 'companion') || [],
);

const mainDeckCount = computed(() =>
    mainDeckCards.value.reduce((sum, c) => sum + c.quantity, 0),
);
const sideboardCount = computed(() =>
    sideboardCards.value.reduce((sum, c) => sum + c.quantity, 0),
);
const commanderCount = computed(() =>
    commanderCards.value.reduce((sum, c) => sum + c.quantity, 0),
);
const companionCount = computed(() =>
    companionCards.value.reduce((sum, c) => sum + c.quantity, 0),
);

// Grouping logic for main deck
type CardGroup = {
    title: string;
    cards: typeof mainDeckCards.value;
    count: number;
};

// Sorting function
const sortCards = (cards: typeof mainDeckCards.value): typeof mainDeckCards.value => {
    const sorted = [...cards];

    if (sortMode.value === 'name') {
        sorted.sort((a, b) => {
            const nameA = (a as any).name || '';
            const nameB = (b as any).name || '';
            return nameA.localeCompare(nameB);
        });
    } else if (sortMode.value === 'cost') {
        sorted.sort((a, b) => {
            const costA = (a as any).manaValue || 0;
            const costB = (b as any).manaValue || 0;
            if (costA !== costB) return costA - costB;
            // Secondary sort by name
            const nameA = (a as any).name || '';
            const nameB = (b as any).name || '';
            return nameA.localeCompare(nameB);
        });
    } else if (sortMode.value === 'color') {
        const colorOrder = ['W', 'U', 'B', 'R', 'G'];
        sorted.sort((a, b) => {
            const colorsA = (a as any).color || [];
            const colorsB = (b as any).color || [];

            // Colorless cards go last
            if (colorsA.length === 0 && colorsB.length > 0) return 1;
            if (colorsA.length > 0 && colorsB.length === 0) return -1;

            // Multicolor sorting
            if (colorsA.length !== colorsB.length) {
                return colorsA.length - colorsB.length;
            }

            // Sort by first color
            const indexA = colorOrder.indexOf(colorsA[0]);
            const indexB = colorOrder.indexOf(colorsB[0]);
            if (indexA !== indexB) return indexA - indexB;

            // Secondary sort by name
            const nameA = (a as any).name || '';
            const nameB = (b as any).name || '';
            return nameA.localeCompare(nameB);
        });
    } else if (sortMode.value === 'type') {
        sorted.sort((a, b) => {
            const typeA = ((a as any).typeMain || [])[0] || '';
            const typeB = ((b as any).typeMain || [])[0] || '';
            if (typeA !== typeB) return typeA.localeCompare(typeB);
            // Secondary sort by name
            const nameA = (a as any).name || '';
            const nameB = (b as any).name || '';
            return nameA.localeCompare(nameB);
        });
    } else if (sortMode.value === 'rarity') {
        const rarityOrder = ['common', 'uncommon', 'rare', 'mythic'];
        sorted.sort((a, b) => {
            const rarityA = (a as any).rarity || 'common';
            const rarityB = (b as any).rarity || 'common';
            const indexA = rarityOrder.indexOf(rarityA);
            const indexB = rarityOrder.indexOf(rarityB);
            if (indexA !== indexB) return indexA - indexB;
            // Secondary sort by name
            const nameA = (a as any).name || '';
            const nameB = (b as any).name || '';
            return nameA.localeCompare(nameB);
        });
    }

    return sorted;
};

const mainDeckGroups = computed((): CardGroup[] => {
    const cards = mainDeckCards.value;

    if (groupMode.value === 'category') {
        // For category mode, just return all cards as one group
        return [{
            title: $t('magic.ui.deck.main-deck'),
            cards: sortCards(cards),
            count: mainDeckCount.value,
        }];
    }

    if (groupMode.value === 'type') {
        // Group by card type (Creature, Instant, Sorcery, etc.)
        const typeGroups = new Map<string, typeof cards>();

        for (const card of cards) {
            const typeMain = (card as any).typeMain || [];
            const primaryType = typeMain[0] || 'Other';

            if (!typeGroups.has(primaryType)) {
                typeGroups.set(primaryType, []);
            }
            typeGroups.get(primaryType)!.push(card);
        }

        return Array.from(typeGroups.entries()).map(([type, typeCards]) => ({
            title: type,
            cards: sortCards(typeCards),
            count: typeCards.reduce((sum, c) => sum + c.quantity, 0),
        })).sort((a, b) => a.title.localeCompare(b.title));
    }

    if (groupMode.value === 'cost') {
        // Group by mana value
        const costGroups = new Map<number, typeof cards>();

        for (const card of cards) {
            const manaValue = (card as any).manaValue || 0;

            if (!costGroups.has(manaValue)) {
                costGroups.set(manaValue, []);
            }
            costGroups.get(manaValue)!.push(card);
        }

        return Array.from(costGroups.entries())
            .sort(([a], [b]) => a - b)
            .map(([cost, costCards]) => ({
                title: cost === 0 ? '0' : String(cost),
                cards: sortCards(costCards),
                count: costCards.reduce((sum, c) => sum + c.quantity, 0),
            }));
    }

    if (groupMode.value === 'color') {
        // Group by color
        const colorGroups = new Map<string, typeof cards>();

        for (const card of cards) {
            const colors = (card as any).color || [];
            let colorKey: string;

            if (colors.length === 0) {
                colorKey = 'Colorless';
            } else if (colors.length === 1) {
                colorKey = colors[0];
            } else {
                colorKey = 'Multicolor';
            }

            if (!colorGroups.has(colorKey)) {
                colorGroups.set(colorKey, []);
            }
            colorGroups.get(colorKey)!.push(card);
        }

        // Define color order
        const colorOrder = ['W', 'U', 'B', 'R', 'G', 'Multicolor', 'Colorless'];

        return colorOrder
            .filter(color => colorGroups.has(color))
            .map(color => ({
                title: color,
                cards: sortCards(colorGroups.get(color)!),
                count: colorGroups.get(color)!.reduce((sum, c) => sum + c.quantity, 0),
            }));
    }

    return [{
        title: $t('magic.ui.deck.main-deck'),
        cards: sortCards(cards),
        count: mainDeckCount.value,
    }];
});

// All deck groups including sideboard, commander, and companion
type DeckSection = {
    category: 'main' | 'sideboard' | 'commander' | 'companion';
    title:    string;
    cards:    typeof mainDeckCards.value;
    count:    number;
};

const allDeckGroups = computed((): DeckSection[] => {
    const sections: DeckSection[] = [];

    // Commander
    if (commanderCards.value.length > 0) {
        sections.push({
            category: 'commander',
            title:    $t('magic.ui.deck.commander'),
            cards:    sortCards(commanderCards.value),
            count:    commanderCount.value,
        });
    }

    // Companion
    if (companionCards.value.length > 0) {
        sections.push({
            category: 'companion',
            title:    $t('magic.ui.deck.companion'),
            cards:    sortCards(companionCards.value),
            count:    companionCount.value,
        });
    }

    // Main deck - add each group as a separate section
    if (mainDeckCards.value.length > 0) {
        const groups = mainDeckGroups.value;

        for (const group of groups) {
            sections.push({
                category: 'main',
                title:    groups.length > 1 ? group.title : $t('magic.ui.deck.main-deck'),
                cards:    group.cards,
                count:    group.count,
            });
        }
    }

    // Sideboard - add each group as a separate section
    if (sideboardCards.value.length > 0) {
        sections.push({
            category: 'sideboard',
            title:    $t('magic.ui.deck.sideboard'),
            cards:    sortCards(sideboardCards.value),
            count:    sideboardCount.value,
        });
    }

    return sections;
});

// Code import/export
const exportDeckCode = () => {
    if (!deck.value) return;

    const lines: string[] = [];

    // Add commander
    if (commanderCards.value.length > 0) {
        lines.push('Commander:');
        for (const card of commanderCards.value) {
            lines.push(`${card.quantity} ${card.cardId}`);
        }
        lines.push('');
    }

    // Add companion
    if (companionCards.value.length > 0) {
        lines.push('Companion:');
        for (const card of companionCards.value) {
            lines.push(`${card.quantity} ${card.cardId}`);
        }
        lines.push('');
    }

    // Add main deck
    if (mainDeckCards.value.length > 0) {
        lines.push('Deck:');
        for (const card of mainDeckCards.value) {
            lines.push(`${card.quantity} ${card.cardId}`);
        }
        lines.push('');
    }

    // Add sideboard
    if (sideboardCards.value.length > 0) {
        lines.push('Sideboard:');
        for (const card of sideboardCards.value) {
            lines.push(`${card.quantity} ${card.cardId}`);
        }
    }

    deckCodeText.value = lines.join('\n');
};

const importDeckCode = async () => {
    if (!deck.value || !deckCodeText.value.trim()) return;

    try {
        const lines = deckCodeText.value.split('\n').map(l => l.trim()).filter(l => l);
        const cards: any[] = [];
        let currentCategory: 'commander' | 'companion' | 'main' | 'sideboard' = 'main';

        for (const line of lines) {
            // Check for category headers
            if (line.toLowerCase() === 'commander:') {
                currentCategory = 'commander';
                continue;
            } else if (line.toLowerCase() === 'companion:') {
                currentCategory = 'companion';
                continue;
            } else if (line.toLowerCase() === 'deck:') {
                currentCategory = 'main';
                continue;
            } else if (line.toLowerCase() === 'sideboard:') {
                currentCategory = 'sideboard';
                continue;
            }

            // Parse card line: "4 Card Name" or "4x Card Name"
            const match = line.match(/^(\d+)x?\s+(.+)$/);
            if (match) {
                const quantity = parseInt(match[1]);
                const cardId = match[2].trim();

                cards.push({
                    cardId,
                    quantity,
                    category: currentCategory,
                });
            }
        }

        // Update deck with parsed cards
        await trpc.magic.deck.update({
            deckId: deck.value.deckId,
            cards,
        });

        $q.notify({
            type:    'positive',
            message: $t('magic.ui.deck.import-success'),
        });

        showCodeDialog.value = false;
        await loadDeck();
    } catch (error) {
        console.error('Failed to import deck code:', error);
        $q.notify({
            type:    'negative',
            message: $t('magic.ui.deck.import-error'),
        });
    }
};

const cancelCodeEdit = () => {
    showCodeDialog.value = false;
    deckCodeText.value = '';
};

// Code mode functions
const generateDeckCode = () => {
    if (!deck.value) return;

    const lines: string[] = [];

    if (codeFormat.value === 'mtgo') {
        // MTGO format
        // Commander
        if (commanderCards.value.length > 0) {
            for (const card of commanderCards.value) {
                const name = card.name;
                lines.push(`${card.quantity} ${name}`);
            }
            lines.push('');
        }

        // Companion
        if (companionCards.value.length > 0) {
            for (const card of companionCards.value) {
                const name = card.name;
                lines.push(`${card.quantity} ${name}`);
            }
            lines.push('');
        }

        // Main deck
        for (const card of mainDeckCards.value) {
            const name = card.name;
            lines.push(`${card.quantity} ${name}`);
        }

        // Sideboard
        if (sideboardCards.value.length > 0) {
            lines.push('');
            for (const card of sideboardCards.value) {
                const name = card.name;
                lines.push(`${card.quantity} ${name}`);
            }
        }
    } else {
        // MTGA format
        // Commander
        if (commanderCards.value.length > 0) {
            lines.push('Commander');
            for (const card of commanderCards.value) {
                const name = (card as any).name || card.cardId;
                lines.push(`${card.quantity} ${name}`);
            }
            lines.push('');
        }

        // Companion
        if (companionCards.value.length > 0) {
            lines.push('Companion');
            for (const card of companionCards.value) {
                const name = (card as any).name || card.cardId;
                lines.push(`${card.quantity} ${name}`);
            }
            lines.push('');
        }

        // Main deck
        lines.push('Deck');
        for (const card of mainDeckCards.value) {
            const name = (card as any).name || card.cardId;
            lines.push(`${card.quantity} ${name}`);
        }

        // Sideboard
        if (sideboardCards.value.length > 0) {
            lines.push('');
            lines.push('Sideboard');
            for (const card of sideboardCards.value) {
                const name = (card as any).name || card.cardId;
                lines.push(`${card.quantity} ${name}`);
            }
        }
    }

    deckCodeText.value = lines.join('\n');
};

const applyDeckCode = async () => {
    if (!deck.value || !deckCodeText.value.trim()) return;

    try {
        // Use new updateFromCode endpoint
        await trpc.magic.deck.updateFromCode({
            deckId: deck.value.deckId,
            code:   deckCodeText.value,
            format: codeFormat.value,
        });

        $q.notify({
            type:    'positive',
            message: $t('magic.ui.deck.update-success'),
        });

        await loadDeck();
    } catch (error) {
        console.error('Failed to apply deck code:', error);
        $q.notify({
            type:    'negative',
            message: $t('magic.ui.deck.update-error'),
        });
    }
};

// Methods
const loadDeck = async () => {
    loading.value = true;
    try {
        const deckId = route.params.deckId as string;
        deck.value = await trpc.magic.deck.get({ deckId });
        // Automatically check legality
        await checkDeckLegality();
    } catch (error) {
        console.error('Failed to load deck:', error);
        $q.notify({
            type:    'negative',
            message: $t('magic.ui.deck.load-error'),
        });
    } finally {
        loading.value = false;
    }
};

const formatOptions = [
    { label: $t('magic.format.standard'), value: 'standard' },
    { label: $t('magic.format.pioneer'), value: 'pioneer' },
    { label: $t('magic.format.modern'), value: 'modern' },
    { label: $t('magic.format.legacy'), value: 'legacy' },
    { label: $t('magic.format.vintage'), value: 'vintage' },
    { label: $t('magic.format.commander'), value: 'commander' },
    { label: $t('magic.format.pauper'), value: 'pauper' },
    { label: $t('magic.format.historic'), value: 'historic' },
    { label: $t('magic.format.alchemy'), value: 'alchemy' },
];

const saveFormat = async (newFormat: string) => {
    if (!deck.value || !newFormat) return;

    try {
        await trpc.magic.deck.update({
            deckId: deck.value.deckId,
            format: newFormat,
        });
        $q.notify({
            type:    'positive',
            message: $t('magic.ui.deck.update-success'),
        });
        await loadDeck();
    } catch (error) {
        console.error('Failed to update format:', error);
        $q.notify({
            type:    'negative',
            message: $t('magic.ui.deck.update-error'),
        });
        await loadDeck();
    }
};

// TODO: Remember to delete this debug function
const debugToggleOwner = () => {
    if (debugIsOwner.value === undefined) {
        debugIsOwner.value = true;
    } else if (debugIsOwner.value === true) {
        debugIsOwner.value = false;
    } else {
        debugIsOwner.value = undefined;
    }
};

const _visibilityOptions = [
    {
        label:       $t('magic.ui.deck.visibility-public'),
        value:       'public',
        description: $t('magic.ui.deck.visibility-public-desc'),
    },
    {
        label:       $t('magic.ui.deck.visibility-unlisted'),
        value:       'unlisted',
        description: $t('magic.ui.deck.visibility-unlisted-desc'),
    },
    {
        label:       $t('magic.ui.deck.visibility-private'),
        value:       'private',
        description: $t('magic.ui.deck.visibility-private-desc'),
    },
];

const startEditName = () => {
    if (!deck.value) return;
    editNameValue.value = deck.value.name;
    editingName.value = true;
};

const cancelEditName = () => {
    editingName.value = false;
    editNameValue.value = '';
};

const saveName = async () => {
    if (!deck.value || !editNameValue.value.trim()) {
        $q.notify({
            type:    'warning',
            message: $t('magic.ui.deck.name-required'),
        });
        return;
    }

    try {
        await trpc.magic.deck.update({
            deckId: deck.value.deckId,
            name:   editNameValue.value.trim(),
        });
        $q.notify({
            type:    'positive',
            message: $t('magic.ui.deck.update-success'),
        });
        editingName.value = false;
        await loadDeck();
    } catch (error) {
        console.error('Failed to update name:', error);
        $q.notify({
            type:    'negative',
            message: $t('magic.ui.deck.update-error'),
        });
    }
};

const startEditDescription = () => {
    if (!deck.value) return;
    editDescriptionValue.value = deck.value.description || '';
    editingDescription.value = true;
};

const cancelEditDescription = () => {
    editingDescription.value = false;
    editDescriptionValue.value = '';
};

const saveDescription = async () => {
    if (!deck.value) return;

    try {
        await trpc.magic.deck.update({
            deckId:      deck.value.deckId,
            description: editDescriptionValue.value.trim() || undefined,
        });
        $q.notify({
            type:    'positive',
            message: $t('magic.ui.deck.update-success'),
        });
        editingDescription.value = false;
        await loadDeck();
    } catch (error) {
        console.error('Failed to update description:', error);
        $q.notify({
            type:    'negative',
            message: $t('magic.ui.deck.update-error'),
        });
    }
};

const filterCards = async (val: string, update: (fn: () => void) => void) => {
    searchInput.value = val;

    if (val.trim() === '') {
        update(() => {
            searchResult.value = [];
        });
        return;
    }

    try {
        const result = await trpc.magic.search.basic({
            q:        val.trim(),
            pageSize: 10,
        });

        update(() => {
            if (result.result != null) {
                searchResult.value = result.result.result;
            } else {
                searchResult.value = [];
            }
        });
    } catch (error) {
        console.error('Failed to search cards:', error);
        update(() => {
            searchResult.value = [];
        });
    }
};

const handleCardSelect = async (card: NormalResult['result'][0] | null) => {
    if (!deck.value || !card) {
        return;
    }

    const cardId = card.cardId;
    const category = 'main';
    const quantity = 1;

    const existingCardIndex = deck.value.cards.findIndex(
        c => c.cardId === cardId && c.category === category,
    );

    // Only send basic card info (cardId, quantity, category) to backend
    // Backend will return full details on reload
    const updatedCards = deck.value.cards.map(c => ({
        cardId:   c.cardId,
        quantity: c.quantity,
        category: c.category,
    }));

    if (existingCardIndex >= 0) {
        updatedCards[existingCardIndex].quantity += quantity;
    } else {
        updatedCards.push({
            cardId,
            quantity,
            category,
        });
    }

    try {
        await trpc.magic.deck.update({
            deckId: deck.value.deckId,
            cards:  updatedCards,
        });
        $q.notify({
            type:    'positive',
            message: $t('magic.ui.deck.card-added'),
        });
        selectedCard.value = null;
        searchInput.value = '';
        searchResult.value = [];
        await loadDeck();
    } catch (error) {
        console.error('Failed to add card:', error);
        $q.notify({
            type:    'negative',
            message: $t('magic.ui.deck.update-error'),
        });
    }
};

const getColumnCards = (cards: typeof mainDeckCards.value, column: number, totalColumns: number) => {
    const itemsPerColumn = Math.ceil(cards.length / totalColumns);
    const start = (column - 1) * itemsPerColumn;
    const end = start + itemsPerColumn;
    return cards.slice(start, end);
};

const confirmDelete = () => {
    showDeleteDialog.value = true;
};

const deleteDeck = async () => {
    if (!deck.value?.name) return;

    const confirmed = await new Promise<boolean>(resolve => {
        $q.dialog({
            title:   $t('magic.ui.deck.confirm-delete'),
            message: $t('magic.ui.deck.delete-warning', { name: deck.value!.name }),
            prompt:  {
                model: '',
                type:  'text',
                label: $t('magic.ui.deck.type-deck-name'),
            },
            cancel:     true,
            persistent: true,
        }).onOk((input: string) => {
            resolve(input === deck.value!.name);
        }).onCancel(() => {
            resolve(false);
        });
    });

    if (!confirmed) {
        $q.notify({
            type:    'warning',
            message: $t('magic.ui.deck.delete-name-mismatch'),
        });
        return;
    }

    try {
        await trpc.magic.deck.delete({ deckId: deck.value!.deckId });
        $q.notify({
            type:    'positive',
            message: $t('magic.ui.deck.delete-success'),
        });
        router.push('/magic/decks');
    } catch (error) {
        console.error('Failed to delete deck:', error);
        $q.notify({
            type:    'negative',
            message: $t('magic.ui.deck.delete-error'),
        });
    }
};

const toggleLike = async () => {
    try {
        await trpc.magic.deck.like({ deckId: deck.value!.deckId });
        // Reload deck to get updated counts
        await loadDeck();
    } catch (error) {
        console.error('Failed to toggle like:', error);
        $q.notify({
            type:    'negative',
            message: $t('magic.ui.deck.like-error'),
        });
    }
};

const toggleFavorite = async () => {
    try {
        await trpc.magic.deck.favorite({ deckId: deck.value!.deckId });
        // Reload deck to get updated counts
        await loadDeck();
    } catch (error) {
        console.error('Failed to toggle favorite:', error);
        $q.notify({
            type:    'negative',
            message: $t('magic.ui.deck.favorite-error'),
        });
    }
};

const formatDate = (date: Date) => {
    return dateUtil.formatDate(date, 'YYYY-MM-DD HH:mm');
};

const checkDeckLegality = async () => {
    if (!deck.value) return;

    legalityResult.value = null;

    try {
        const result = await trpc.magic.deck.checkLegality({
            deckId: deck.value.deckId,
        });
        legalityResult.value = result;
    } catch (error) {
        console.error('Failed to check legality:', error);
        // Silent failure, don't show error notification
    }
};

// Load on mount
onMounted(async () => {
    await loadDeck();
});
</script>
