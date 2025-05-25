<template>
    <div class="q-pa-md">
        <div class="row items-center q-mb-md q-gutter-md">
            <q-select
                v-model="id"
                dense outlined
                use-input hide-selected
                fill-input
                input-debounce="0"
                :options="filteredSet"
                @filter="filterFn"
            />

            <q-space />

            <q-btn
                label="Calc Field"
                outline
                @click="calcField"
            />
            <q-btn
                icon="mdi-upload"
                flat dense round
                @click="save"
            />
        </div>

        <div>
            <div v-for="l in localization" :key="l.lang" class="row items-center q-gutter-md">
                <div class="code" style="flex-basis: 25px">
                    {{ l.lang }}
                </div>
                <q-checkbox
                    :model-value="l.isOfficialName"
                    :disable="l.name == null"
                    @update:model-value="() => toggleIsOfficialName(l.lang)"
                />
                <q-input
                    :model-value="l.name"
                    class="col"
                    dense outlined
                    @update:model-value="v => assignName(l.lang, v as string)"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import {
    ref, computed, watch, onMounted,
} from 'vue';
import type { QSelectProps } from 'quasar';

import { useRouter, useRoute } from 'vue-router';
import { useGame } from 'store/games/ptcg';

import controlSetup from 'setup/control';

import { Set, SetLocalization } from 'interface/ptcg/set';

import { apiGet } from 'boot/server';

const router = useRouter();
const route = useRoute();
const game = useGame();

const { controlGet, controlPost } = controlSetup();

const set = ref<string[]>([]);
const data = ref<Set | null>(null);
const filteredSet = ref<string[]>([]);

const id = computed({
    get() { return route.query.id as string ?? set.value[0]; },
    set(newValue: string) {
        void router.replace({
            query: {
                ...route.query,
                id: newValue,
            },
        });
    },
});

const localization = computed(() => game.locales.map(
    l => data.value?.localization?.find(v => v.lang === l) ?? { lang: l } as SetLocalization,
));

const prettify = () => {
    if (data.value == null) {
        return;
    }

    data.value.localization = data.value.localization.filter(
        l => (l.name != null && l.name !== ''),
    );

    for (const l of data.value.localization) {
        if (l.name === '') {
            delete l.name;
            delete l.isOfficialName;
        }
    }
};

const save = async () => {
    if (data.value != null) {
        prettify();

        await controlPost('/ptcg/set/save', { data: data.value });
    }
};

const loadData = async () => {
    if (data.value != null) {
        await save();
    }

    const { data: result } = await controlGet<Set>('/ptcg/set/raw', {
        id: id.value,
    });

    data.value = result;
};

const loadList = async () => {
    const { data: sets } = await apiGet<string[]>('/ptcg/set');

    set.value = sets;

    if (data.value == null) {
        void loadData();
    }
};

const filterFn = (val: string, update: Parameters<NonNullable<QSelectProps['onFilter']>>[1]) => {
    if (val === '') {
        update(
            () => { filteredSet.value = set.value; },
            () => { /* no-op */ },
        );
    } else {
        update(
            () => { filteredSet.value = set.value.filter(s => s.includes(val)); },
            () => { /* no-op */ },
        );
    }
};

const assignName = (lang: string, name: string) => {
    if (data.value == null) {
        return;
    }

    const loc = data.value.localization.find(l => l.lang === lang);

    if (loc == null) {
        data.value.localization = [...data.value.localization, { lang, name, isOfficialName: true }];
    } else {
        if (loc.name == null || loc.name === '') {
            loc.isOfficialName = true;
        }

        loc.name = name;
    }
};

const toggleIsOfficialName = (lang: string) => {
    if (data.value == null) {
        return;
    }

    const loc = data.value.localization.find(l => l.lang === lang);

    if (loc != null) {
        loc.isOfficialName = !loc.isOfficialName;
    }
};

const calcField = async () => {
    await controlPost('/ptcg/set/calc', { id: id.value });
};

watch(set, () => { filteredSet.value = set.value; });
watch(id, loadData);
onMounted(loadList);
</script>
