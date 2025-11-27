<template>
    <div class="q-pa-md">
        <div class="row items-center q-mb-md">
            <q-select
                v-model="id"
                dense outlined
                use-input hide-selected
                fill-input
                input-debounce="0"
                :options="filteredSet"
                @filter="filterFn"
            />

            <q-input
                v-model="setId"
                class="q-ml-md"
                outlined dense
            />

            <q-space />

            <q-btn
                icon="mdi-upload"
                flat dense round
                @click="save"
            />

            <q-btn
                icon="mdi-plus"
                flat dense round
                @click="newSet"
            />
        </div>

        <div>
            <div v-for="l in localization" :key="l.lang" class="row items-center q-gutter-md">
                <div class="code" style="flex-basis: 25px">
                    {{ l.lang }}
                </div>
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
import { ref, computed, watch, onMounted } from 'vue';

import type { QSelectProps } from 'quasar';

import { useRouter, useRoute } from 'vue-router';

import { locale } from '@model/hearthstone/schema/basic';
import { Set, SetLocalization } from '@model/hearthstone/schema/set';

import { trpc } from 'src/trpc';

const router = useRouter();
const route = useRoute();

const sets = ref<string[]>([]);
const data = ref<Set>();
const filteredSet = ref<string[]>([]);

const id = computed({
    get() { return route.query.id as string ?? sets.value[0] ?? ''; },
    set(newValue: string) {
        void router.replace({
            query: {
                ...route.query,
                id: newValue,
            },
        });
    },
});

const setId = computed({
    get() { return data?.value?.setId ?? ''; },
    set(newValue: string) {
        if (data.value != null) {
            data.value.setId = newValue;
        }
    },
});

const localization = computed(() => Object.values(locale.enum).map(
    l => data.value?.localization?.find(v => v.lang === l) ?? { lang: l } as SetLocalization,
));

const loadList = async () => {
    sets.value = await trpc.hearthstone.set.list();

    if (data.value == null) {
        void loadData();
    }
};

const loadData = async () => {
    if (data.value != null) {
        await save();
    }

    data.value = await trpc.hearthstone.set.full({ setId: id.value });
};

const filterFn = (val: string, update: Parameters<NonNullable<QSelectProps['onFilter']>>[1]) => {
    if (val === '') {
        update(
            () => { filteredSet.value = sets.value; },
            () => { /* no-op */ },
        );
    } else {
        update(
            () => { filteredSet.value = sets.value.filter(s => s.includes(val)); },
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

const prettify = () => {
    if (data.value == null) {
        return;
    }

    data.value.localization = data.value.localization.filter(
        l => l.name != null && l.name !== '',
    );
};

const save = async () => {
    if (data.value == null || data.value.setId == '') {
        return;
    }

    prettify();

    await trpc.hearthstone.set.save(data.value);

    await loadList();
};

const newSet = async () => {
    await save();

    id.value = sets.value[0];

    data.value = {
        setId:         '',
        dbfId:         0,
        localization:  [],
        type:          '',
        releaseDate:   '0000-00-00',
        cardCount:     0,
        cardCountFull: 0,
    };
};

watch(sets, () => { filteredSet.value = sets.value; });
watch(id, loadData);
onMounted(loadList);

</script>
