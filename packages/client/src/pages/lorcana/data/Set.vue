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
                <!-- <q-checkbox
                    :model-value="l.isOfficialName"
                    :disable="l.name == null"
                    @update:model-value="() => toggleIsOfficialName(l.lang)"
                /> -->
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

import { locale } from '@model/lorcana/schema/basic';
import { Set, SetLocalization } from '@model/lorcana/schema/set';

import { trpc } from 'src/trpc';

const router = useRouter();
const route = useRoute();

const set = ref<string[]>([]);
const data = ref<Set>();
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

const localization = computed(() => locale.options.map(
    l => data.value?.localization?.find(v => v.lang === l) ?? { lang: l } as SetLocalization,
));

const prettify = () => {
    if (data.value == null) {
        return;
    }

    data.value.localization = data.value.localization.filter(l => l.name !== '');
};

const save = async () => {
    if (data.value == null) {
        return;
    }

    prettify();

    await trpc.lorcana.set.save(data.value);
};

const loadData = async () => {
    if (data.value != null) {
        await save();
    }

    data.value = await trpc.lorcana.set.full({ setId: id.value });
};

const loadList = async () => {
    set.value = await trpc.lorcana.set.list();

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
        data.value.localization = [...data.value.localization, { lang, name }];
    } else {
        loc.name = name;
    }
};

// const toggleIsOfficialName = (_lang: string) => {
//     if (data.value == null) {
//         return;
//     }
// };

const calcField = async () => {
    await trpc.lorcana.set.calcField();
};

watch(set, () => { filteredSet.value = set.value; });
watch(id, loadData);
onMounted(loadList);
</script>
