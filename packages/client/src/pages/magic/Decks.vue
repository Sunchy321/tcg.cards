<template>
    <q-page class="q-pa-md">
        <div class="row q-col-gutter-md">
            <!-- Filters -->
            <div class="col-12">
                <q-card flat bordered>
                    <q-card-section>
                        <div class="row q-col-gutter-md">
                            <div class="col-12 col-md-3">
                                <q-select
                                    v-model="filters.format"
                                    :label="$t('magic.ui.deck.format')"
                                    :options="formatOptions"
                                    emit-value map-options
                                    clearable
                                    outlined dense
                                />
                            </div>
                            <div class="col-12 col-md-3">
                                <q-select
                                    v-model="filters.sortBy"
                                    :label="$t('magic.ui.deck.sort-by')"
                                    :options="sortOptions"
                                    emit-value map-options
                                    outlined dense
                                />
                            </div>
                            <div class="col-12 col-md-3">
                                <q-select
                                    v-model="filters.sortOrder"
                                    :label="$t('magic.ui.deck.sort-order')"
                                    :options="sortOrderOptions"
                                    emit-value map-options
                                    outlined dense
                                />
                            </div>
                            <div class="col-12 col-md-3">
                                <q-input
                                    v-model="tagInput"
                                    :label="$t('magic.ui.deck.tags')"
                                    emit-value map-options
                                    outlined dense
                                    @keyup.enter="addTag"
                                >
                                    <template #append>
                                        <q-icon name="mdi-plus" class="cursor-pointer" @click="addTag" />
                                    </template>
                                </q-input>
                                <div v-if="filters.tags.length > 0" class="q-mt-sm">
                                    <q-chip
                                        v-for="tag in filters.tags"
                                        :key="tag"
                                        removable
                                        color="primary"
                                        text-color="white"
                                        @remove="removeTag(tag)"
                                    >
                                        {{ tag }}
                                    </q-chip>
                                </div>
                            </div>
                        </div>
                    </q-card-section>
                </q-card>
            </div>

            <!-- Deck List -->
            <div class="col-12">
                <div v-if="loading" class="q-pa-md">
                    <q-skeleton height="100px" />
                </div>

                <div v-else-if="decks.length === 0" class="text-center q-pa-lg text-grey-6">
                    {{ $t('magic.ui.deck.no-decks') }}
                </div>

                <q-list v-else bordered separator>
                    <q-item
                        v-for="deck in decks"
                        :key="deck.deckId"
                        clickable
                        @click="viewDeck(deck.deckId)"
                    >
                        <q-item-section>
                            <q-item-label class="text-h6">{{ deck.name }}</q-item-label>
                            <q-item-label caption>
                                {{ deck.format }} • {{ formatDate(deck.updatedAt) }}
                            </q-item-label>
                            <div v-if="deck.tags.length > 0" class="q-mt-sm">
                                <q-chip
                                    v-for="tag in deck.tags"
                                    :key="tag"
                                    size="sm"
                                    color="grey-3"
                                >
                                    {{ tag }}
                                </q-chip>
                            </div>
                        </q-item-section>

                        <q-item-section side>
                            <div class="row items-center q-gutter-md">
                                <div class="row items-center q-gutter-xs">
                                    <q-icon name="mdi-eye" size="sm" />
                                    <span class="text-caption">{{ deck.views }}</span>
                                </div>
                                <div class="row items-center q-gutter-xs">
                                    <q-icon name="mdi-heart" size="sm" />
                                    <span class="text-caption">{{ deck.likes }}</span>
                                </div>
                                <div class="row items-center q-gutter-xs">
                                    <q-icon name="mdi-star" size="sm" />
                                    <span class="text-caption">{{ deck.favorites }}</span>
                                </div>
                                <q-btn
                                    v-if="user?.id === deck.userId"
                                    flat round dense
                                    icon="mdi-dots-vertical"
                                    @click.stop
                                >
                                    <q-menu>
                                        <q-list>
                                            <q-item clickable @click="deleteDeck(deck.deckId, deck.name)">
                                                <q-item-section avatar>
                                                    <q-icon name="mdi-delete" color="negative" />
                                                </q-item-section>
                                                <q-item-section>{{ $t('common.delete') }}</q-item-section>
                                            </q-item>
                                        </q-list>
                                    </q-menu>
                                </q-btn>
                            </div>
                        </q-item-section>
                    </q-item>
                </q-list>
            </div>

            <!-- Pagination -->
            <div v-if="!loading && total > 0" class="col-12 flex flex-center">
                <q-pagination
                    v-model="currentPage"
                    :max="Math.ceil(total / pageSize)"
                    :max-pages="7"
                    boundary-numbers
                    @update:model-value="loadDecks"
                />
            </div>
        </div>

        <!-- Create Deck Dialog -->
        <q-dialog v-model="showCreateDialog" persistent>
            <q-card style="min-width: 400px">
                <q-card-section>
                    <div class="text-h6">{{ $t('magic.ui.deck.create-deck') }}</div>
                </q-card-section>

                <q-separator />

                <q-card-section class="q-pt-md">
                    <q-form @submit.prevent="submitCreateDeck">
                        <q-input
                            v-model="newDeck.name"
                            :label="$t('magic.ui.deck.name')"
                            :rules="[val => !!val || $t('magic.ui.deck.name-required')]"
                            outlined
                            autofocus
                            class="q-mb-md"
                        />

                        <q-select
                            v-model="newDeck.format"
                            :label="$t('magic.ui.deck.format')"
                            :options="formatOptions"
                            emit-value map-options
                            :rules="[val => !!val || $t('magic.ui.deck.format-required')]"
                            outlined
                            class="q-mb-md"
                        />

                        <q-select
                            v-model="newDeck.visibility"
                            :label="$t('magic.ui.deck.visibility')"
                            :options="visibilityOptions"
                            emit-value map-options
                            outlined
                        >
                            <template #option="{ itemProps, opt }">
                                <q-item v-bind="itemProps">
                                    <q-item-section>
                                        <q-item-label>{{ opt.label }}</q-item-label>
                                        <q-item-label caption>{{ opt.description }}</q-item-label>
                                    </q-item-section>
                                </q-item>
                            </template>
                        </q-select>
                    </q-form>
                </q-card-section>

                <q-card-actions align="right">
                    <q-btn
                        flat
                        :label="$t('common.cancel')"
                        color="primary"
                        @click="showCreateDialog = false"
                    />
                    <q-btn
                        flat
                        :label="$t('common.add')"
                        color="primary"
                        :loading="creating"
                        @click="submitCreateDeck"
                    />
                </q-card-actions>
            </q-card>
        </q-dialog>
    </q-page>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue';

import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAction, useTitle } from 'store/core';

import { date as dateUtil, useQuasar } from 'quasar';

import { trpc } from 'src/trpc';
import { auth } from 'src/auth';

import { DeckListItem } from '@model/magic/schema/deck';

const router = useRouter();
const i18n = useI18n();
const session = auth.useSession();
const $q = useQuasar();

const user = computed(() => session.value?.data?.user);

useTitle(() => i18n.t('magic.ui.deck.decks'));

useAction([{
    action:  'create',
    icon:    'mdi-plus',
    enabled: () => {
        return user.value != null;
    },
    handler: () => {
        createDeck();
    },
}]);

// Data
const decks = ref<DeckListItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const tagInput = ref('');
const showCreateDialog = ref(false);
const creating = ref(false);
const deletingDeckId = ref<string | null>(null);

// New deck form
const newDeck = ref({
    name:       '',
    format:     'standard',
    visibility: 'private' as 'public' | 'unlisted' | 'private',
});

// Filters
const filters = ref({
    format:    null as string | null,
    sortBy:    'updatedAt' as 'createdAt' | 'updatedAt' | 'views' | 'likes' | 'favorites',
    sortOrder: 'desc' as 'asc' | 'desc',
    tags:      [] as string[],
});

// Options
const formatOptions = [
    'standard', 'pioneer', 'modern', 'legacy', 'vintage',
    'commander', 'pauper', 'historic', 'alchemy',
].map(f => ({
    label: i18n.t(`magic.format.${f}`),
    value: f,
}));

const sortOptions = [
    { label: i18n.t('magic.ui.deck.created-at'), value: 'createdAt' },
    { label: i18n.t('magic.ui.deck.updated-at'), value: 'updatedAt' },
    { label: i18n.t('magic.ui.deck.views'), value: 'views' },
    { label: i18n.t('magic.ui.deck.likes'), value: 'likes' },
    { label: i18n.t('magic.ui.deck.favorites'), value: 'favorites' },
];

const sortOrderOptions = [
    { label: i18n.t('magic.ui.deck.ascending'), value: 'asc' },
    { label: i18n.t('magic.ui.deck.descending'), value: 'desc' },
];

const visibilityOptions = [
    {
        label:       i18n.t('magic.ui.deck.visibility-public'),
        value:       'public',
        description: i18n.t('magic.ui.deck.visibility-public-desc'),
    },
    {
        label:       i18n.t('magic.ui.deck.visibility-unlisted'),
        value:       'unlisted',
        description: i18n.t('magic.ui.deck.visibility-unlisted-desc'),
    },
    {
        label:       i18n.t('magic.ui.deck.visibility-private'),
        value:       'private',
        description: i18n.t('magic.ui.deck.visibility-private-desc'),
    },
];

// Methods
const loadDecks = async () => {
    loading.value = true;
    try {
        const response = await trpc.magic.deck.list({
            format:    filters.value.format || undefined,
            tags:      filters.value.tags.length > 0 ? filters.value.tags : undefined,
            sortBy:    filters.value.sortBy,
            sortOrder: filters.value.sortOrder,
            page:      currentPage.value,
            pageSize:  pageSize.value,
        });

        decks.value = response.decks;
        total.value = response.total;
    } catch (error) {
        console.error('Failed to load decks:', error);
    } finally {
        loading.value = false;
    }
};

const viewDeck = (deckId: string) => {
    const route = router.resolve(`/magic/deck/${deckId}`);
    window.open(route.href, '_blank');
};

const createDeck = () => {
    // Reset form
    newDeck.value = {
        name:       '',
        format:     'standard',
        visibility: 'private',
    };
    showCreateDialog.value = true;
};

const submitCreateDeck = async () => {
    if (newDeck.value.name.trim() === '' || newDeck.value.format == null) {
        return;
    }

    creating.value = true;

    try {
        await trpc.magic.deck.create({
            name:       newDeck.value.name,
            format:     newDeck.value.format,
            cards:      [],
            visibility: newDeck.value.visibility,
            tags:       [],
        });
        showCreateDialog.value = false;
        loadDecks();
    } catch (error) {
        console.error('Failed to create deck:', error);
    } finally {
        creating.value = false;
    }
};

const addTag = () => {
    const tag = tagInput.value.trim();
    if (tag && !filters.value.tags.includes(tag)) {
        filters.value.tags.push(tag);
        tagInput.value = '';
        currentPage.value = 1;
        loadDecks();
    }
};

const removeTag = (tag: string) => {
    filters.value.tags = filters.value.tags.filter(t => t !== tag);
    currentPage.value = 1;
    loadDecks();
};

const deleteDeck = async (deckId: string, deckName: string) => {
    const confirmed = await new Promise<boolean>(resolve => {
        $q.dialog({
            title:      i18n.t('magic.ui.deck.confirm-delete'),
            message:    i18n.t('magic.ui.deck.delete-warning', { name: deckName }),
            cancel:     true,
            persistent: true,
            ok:         {
                label:      i18n.t('common.delete'),
                color:      'negative',
                unelevated: true,
            },
        }).onOk(() => {
            resolve(true);
        }).onCancel(() => {
            resolve(false);
        });
    });

    if (!confirmed) {
        return;
    }

    deletingDeckId.value = deckId;
    try {
        await trpc.magic.deck.delete({ deckId });
        $q.notify({
            type:    'positive',
            message: i18n.t('magic.ui.deck.delete-success'),
        });
        await loadDecks();
    } catch (error) {
        console.error('Failed to delete deck:', error);
        $q.notify({
            type:    'negative',
            message: i18n.t('magic.ui.deck.delete-error'),
        });
    } finally {
        deletingDeckId.value = null;
    }
};

const formatDate = (date: Date) => {
    return dateUtil.formatDate(date, 'YYYY-MM-DD');
};

// Watch filters
watch(() => [filters.value.format, filters.value.sortBy, filters.value.sortOrder], () => {
    currentPage.value = 1;
    loadDecks();
});

// Load on mount
onMounted(() => {
    loadDecks();
});
</script>
