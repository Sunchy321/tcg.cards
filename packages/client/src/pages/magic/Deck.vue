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
                    <q-space />

                    <q-select
                        v-if="isOwner"
                        v-model="selectedCard"
                        :options="searchResult"
                        :option-label="opt => opt ? opt.name : ''"
                        :option-value="opt => opt ? opt.cardId : ''"
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
                                    <q-item-label>{{ opt.name }}</q-item-label>
                                    <q-item-label caption>{{ opt.cardId }}</q-item-label>
                                </q-item-section>
                            </q-item>
                        </template>
                    </q-select>
                </q-toolbar>

                <!-- Main Deck -->
                <q-card v-if="mainDeckCards.length > 0" flat bordered class="q-mb-md">
                    <q-card-section>
                        <div class="text-h6">{{ $t('magic.ui.deck.main-deck') }} ({{ mainDeckCount }})</div>
                    </q-card-section>
                    <q-separator />
                    <q-card-section>
                        <div v-for="card in mainDeckCards" :key="card.cardId" class="row items-center q-mb-sm">
                            <div class="col-1 text-right">{{ card.quantity }}x</div>
                            <div class="col">
                                <router-link :to="`/magic/card/${card.cardId}`" class="text-primary">
                                    {{ card.cardId }}
                                </router-link>
                            </div>
                        </div>
                    </q-card-section>
                </q-card>

                <!-- Sideboard -->
                <q-card v-if="sideboardCards.length > 0" flat bordered class="q-mb-md">
                    <q-card-section>
                        <div class="text-h6">{{ $t('magic.ui.deck.sideboard') }} ({{ sideboardCount }})</div>
                    </q-card-section>
                    <q-separator />
                    <q-card-section>
                        <div v-for="card in sideboardCards" :key="card.cardId" class="row items-center q-mb-sm">
                            <div class="col-1 text-right">{{ card.quantity }}x</div>
                            <div class="col">
                                <router-link :to="`/magic/card/${card.cardId}`" class="text-primary">
                                    {{ card.cardId }}
                                </router-link>
                            </div>
                        </div>
                    </q-card-section>
                </q-card>

                <!-- Commander -->
                <q-card v-if="commanderCards.length > 0" flat bordered class="q-mb-md">
                    <q-card-section>
                        <div class="text-h6">{{ $t('magic.ui.deck.commander') }}</div>
                    </q-card-section>
                    <q-separator />
                    <q-card-section>
                        <div v-for="card in commanderCards" :key="card.cardId" class="row items-center q-mb-sm">
                            <div class="col-1 text-right">{{ card.quantity }}x</div>
                            <div class="col">
                                <router-link :to="`/magic/card/${card.cardId}`" class="text-primary">
                                    {{ card.cardId }}
                                </router-link>
                            </div>
                        </div>
                    </q-card-section>
                </q-card>

                <!-- Companion -->
                <q-card v-if="companionCards.length > 0" flat bordered>
                    <q-card-section>
                        <div class="text-h6">{{ $t('magic.ui.deck.companion') }}</div>
                    </q-card-section>
                    <q-separator />
                    <q-card-section>
                        <div v-for="card in companionCards" :key="card.cardId" class="row items-center q-mb-sm">
                            <div class="col-1 text-right">{{ card.quantity }}x</div>
                            <div class="col">
                                <router-link :to="`/magic/card/${card.cardId}`" class="text-primary">
                                    {{ card.cardId }}
                                </router-link>
                            </div>
                        </div>
                    </q-card-section>
                </q-card>
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
    </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';

import { useRoute, useRouter } from 'vue-router';
import { useQuasar, date as dateUtil } from 'quasar';
import { useI18n } from 'vue-i18n';

import { DeckView } from '@model/magic/schema/deck';
import { NormalResult } from '@model/magic/schema/search';

import { debounce } from 'lodash';

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
const editingName = ref(false);
const editNameValue = ref('');
const editingDescription = ref(false);
const editDescriptionValue = ref('');

// Card search and add
const searchInput = ref('');
const searchResult = ref<NormalResult['result']>([]);
const selectedCard = ref<NormalResult['result'][0] | null>(null);

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
const totalCards = computed(() =>
    mainDeckCount.value + sideboardCount.value + commanderCount.value + companionCount.value,
);

// Methods
const loadDeck = async () => {
    loading.value = true;
    try {
        const deckId = route.params.deckId as string;
        deck.value = await trpc.magic.deck.get({ deckId });
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

const visibilityOptions = [
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

    if (val.trim().length < 2) {
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

    const updatedCards = [...deck.value.cards];
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

// Load on mount
onMounted(async () => {
    await loadDeck();
});
</script>
