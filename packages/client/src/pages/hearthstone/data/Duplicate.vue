<template lang="pug">
div.q-pa-md
    div.q-mb-md
        span {{ total }}
        q-btn.q-mx-md(outline dense :disable="!resolveEnabled" @click="resolveDuplicate") Resolve

    JsonComparator(:values="values", :key-order="keyOrder", @update-value="updateValue")
        template(#default="{ text, value, index, which }")
            template(v-if="index[index.length - 1] == '.cardId'")
                | cardId:
                q-input.cardid-input(
                    flat dense outlined
                    :model-value="value" @update:model-value="value => updateValue({ index, value, which })"
                )
            span(v-else) {{ text }}
</template>

<style lang="sass" scoped>
.cardid-input
    flex-basis: 300px

</style>

<script setup lang="ts">
import {
    ref, computed, onMounted,
} from 'vue';

import controlSetup from 'setup/control';

import JsonComparator from 'components/JSONComparator.vue';

import type { Card } from 'interface/hearthstone/card';

import { isEqual, set, uniq } from 'lodash';

export type ICardUpdation = {
    cardId: string;
    scryfallId: string;
    key: string;
    partIndex?: number;
    oldValue: any;
    newValue: any;

    set: string;
    number: string;
    lang: string;
};

type DuplicateData = {
    total: number;
    values: (Card & { _id: string })[];
};

const { controlGet, controlPost } = controlSetup();

const data = ref<DuplicateData>({
    total:  0,
    values: [],
});

const initial = ref({
    cardId:  '',
    version: [] as number[],
});

const total = computed(() => data.value.total);
const values = computed(() => data.value.values);

const resolveEnabled = computed(() => uniq(values.value.map(v => v.cardId)).length !== 1
    || values.value.every((v, i, a) => i === a.length - 1 || isEqual(v, a[i + 1])));

const updateValue = ({ index, value, which }: { index: string[], value: any, which?: number }) => {
    if (index.length === 0) {
        if (which != null) {
            values.value[which] = value;
        } else {
            for (const [i] of values.value.entries()) {
                values.value[i] = value;
            }
        }
    } else {
        const path = index.map(v => (v.startsWith('.') ? v.slice(1) : v.slice(1, -1)));

        if (which != null) {
            set(values.value[which], path, value);
        } else {
            for (const v of values.value) {
                set(v, path, value);
            }
        }
    }
};

const loadData = async () => {
    const { data: result } = await controlGet<DuplicateData>('/hearthstone/card/get-duplicate');

    data.value = result;
    initial.value = {
        cardId:  result.values[0]?.cardId ?? '',
        version: result.values[0]?.version ?? [],
    };
};

const resolveDuplicate = async () => {
    await controlPost('/hearthstone/card/resolve-duplicate', {
        data:    values.value,
        initial: initial.value,
    });

    await loadData();
};

const keyOrder = (key: string, allValues: any[], indent: number) => {
    if (key === '.cardId' && indent === 0) {
        return 999;
    }

    return 0;
};

onMounted(loadData);
</script>
