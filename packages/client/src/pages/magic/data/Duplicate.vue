<template>
    <div class="q-pa-md">
        <div class="q-mb-md">
            <span>{{ total }}</span>

            <q-btn class="q-mx-md" outline dense :disable="!allSame" @click="resolveDuplicate">
                Resolve
            </q-btn>

            <card-avatar v-if="cardId != null && version != null" :id="cardId" :version="version" use-lang />
        </div>

        <json-comparator :values="values" @update-value="updateValue" />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

import controlSetup from 'setup/control';

import { Duplicate } from '@model/magic/schema/data/duplicate';

import JsonComparator from 'components/JSONComparator.vue';
import CardAvatar from 'components/magic/CardAvatar.vue';

import { isEqual, set } from 'lodash';

export type ICardUpdation = {
    cardId:     string;
    scryfallId: string;
    key:        string;
    partIndex?: number;
    oldValue:   any;
    newValue:   any;

    set:    string;
    number: string;
    lang:   string;
};

const { controlGet, controlPost } = controlSetup();

const data = ref<Duplicate>();

const total = computed(() => data.value?.total ?? 0);

const cardId = computed(() => data.value?.duplicates[0]);
const values = computed(() => data.value?.duplicateData ?? []);

const version = computed(() => {
    const first = data.value?.duplicateData[0];

    if (first != null) {
        return { set: first.set, number: first.number, lang: first.lang };
    } else {
        return undefined;
    }
});

const allSame = computed(() => values.value.every((v, i, a) => i === a.length - 1 || isEqual(v, a[i + 1])));

const updateValue = ({ index, value }: { index: string[], value: any }) => {
    if (index.length === 0) {
        for (const [i] of values.value.entries()) {
            values.value[i] = value;
        }
    } else {
        const path = index.map(v => (v.startsWith('.') ? v.slice(1) : v.slice(1, -1)));

        for (const v of values.value) {
            set(v, path, value);
        }
    }
};

const loadData = async () => {
    const { data: result } = await controlGet<DuplicateData>('/magic/print/get-duplicate');

    data.value = result;
};

const resolveDuplicate = async () => {
    const value = values.value[0];

    if (value == null) {
        return;
    }

    await controlPost('/magic/print/resolve-duplicate', { data: value });

    await loadData();
};

onMounted(loadData);

</script>
