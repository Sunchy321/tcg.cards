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
import { useYugioh } from 'src/stores/games/yugioh';

import { Card } from 'interface/yugioh/card';

import { apiGet } from 'boot/server';

const model = defineModel<string>({ required: true });

const router = useRouter();
const yugioh = useYugioh();

const input = ref('');

const getData = async (name: string, id: string): Promise<Card | Card[]> => {
    name = name.trim();

    if (name.startsWith('!') || name.includes('_')) {
        const { data } = await apiGet<Card>('/yugioh/card', {
            id: name.replace(/^!/, '').trim(),
        });

        return data;
    }

    if (name === '') {
        const { data } = await apiGet<Card>('/yugioh/card', { id });

        return data;
    }

    let { data } = await apiGet<Card[]>('/yugioh/card/name', {
        name: name.replace(/’/g, '\'').replace(/^"(.*)"$/, (_, m1) => m1),
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

    const { locale, locales } = yugioh;
    const defaultLocale = locales[0];

    const loc = data.localization.find(l => l.lang === locale)
      ?? data.localization.find(l => l.lang === defaultLocale)
      ?? data.localization[0];

    if (data != null) {
        input.value = loc.name;
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
