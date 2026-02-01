<template>
    <div>
        <div v-if="cards.length === 0" class="text-grey-6 text-center q-pa-md">
            {{ $t('magic.ui.deck.no-cards') }}
        </div>

        <q-list v-else bordered separator>
            <q-item v-for="(card, index) in cards" :key="index">
                <q-item-section side>
                    <q-input
                        :model-value="card.quantity"
                        type="number"
                        min="1"
                        dense
                        outlined
                        style="width: 60px"
                        @update:model-value="(val: any) => $emit('update-quantity', card.originalIndex, Number(val))"
                    />
                </q-item-section>

                <q-item-section>
                    <q-item-label>{{ card.cardId }}</q-item-label>
                    <q-item-label v-if="card.version" caption>
                        {{ card.version.set }} #{{ card.version.number }}
                        <span v-if="card.version.lang">({{ card.version.lang }})</span>
                    </q-item-label>
                </q-item-section>

                <q-item-section side>
                    <q-btn
                        flat
                        round
                        dense
                        icon="delete"
                        color="negative"
                        @click="$emit('remove', card.originalIndex)"
                    />
                </q-item-section>
            </q-item>
        </q-list>
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { DeckCard } from 'src/common/magic/deck';

const { t: $t } = useI18n();

interface CardWithIndex extends DeckCard {
    originalIndex: number;
}

defineProps<{
    cards: CardWithIndex[];
}>();

defineEmits<{
    'remove':          [index: number];
    'update-quantity': [index: number, quantity: number];
}>();
</script>
