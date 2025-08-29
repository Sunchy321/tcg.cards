<template>
    <q-input v-model="input" :label="model" @keypress.enter="search">
        <template #append>
            <slot name="append" />
            <q-btn
                v-if="href !== ''"
                icon="mdi-link-variant"
                flat dense round
                :href="href"
                target="_blank"
            />
            <q-btn
                icon="mdi-magnify"
                flat dense round
                @click="search"
            />
        </template>
    </q-input>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import { useRouter } from 'vue-router';
import { useGame } from 'src/stores/games/yugioh';

import { CardView } from '@model/yugioh/schema/card';

import { trpc } from 'src/trpc';

const model = defineModel<string>({ required: true });

const router = useRouter();
const game = useGame();

const input = ref('');

const getData = async (name: string, id: string): Promise<CardView | CardView[]> => {
    name = name.trim();

    if (name.startsWith('!') || name.includes('_')) {
        return await trpc.yugioh.card.summary({
            cardId: name.replace(/^!/, '').trim(),
            lang:   game.locale,
        });
    }

    if (name === '') {
        return await trpc.yugioh.card.summary({
            cardId: id,
            lang:   game.locale,
        });
    }

    const data = await trpc.yugioh.card.summaryByName({
        name: name.replace(/’/g, '\'').replace(/^"(.*)"$/, (_, m1) => m1),
        lang: game.locale,
    });

    if (data.length === 1) {
        return data[0];
    } else {
        return data;
    }
};

const search = async () => {
    if (input.value.trim().startsWith('#')) {
        model.value = input.value.trim();
        return;
    }

    const data = await getData(input.value, model.value);

    if (Array.isArray(data)) {
        input.value = data.map(v => v.cardId).sort().join(', ');
        return;
    }

    if (data != null) {
        input.value = data.localization.name;
        model.value = data.cardId;
    }
};

const href = computed(() => {
    if (model.value == null || model.value === '') {
        return '';
    }

    return router.resolve({
        name:   'yugioh/card',
        params: {
            id: model.value,
        },
    }).href;
});

</script>
