<template>
    <div class="q-ma-md">
        <div class="row items-center q-mb-md">
            <span>{{ total }}</span>
            <q-btn class="q-ml-md" outline dense :disable="!resolveEnabled" @click="resolveDuplicate">Resolve</q-btn>
            <q-btn class="q-ml-md" outline dense @click="mergeData">Merge</q-btn>
            <q-btn class="q-ml-md" outline dense @click="rotateData">Rotate</q-btn>

            <span style="width: 30px" />

            <q-btn
                v-for="(v, k) in resolveSnippets" :key="k"
                class="q-ml-sm"
                dense outline rounded
                color="primary"
                @click="v"
            >{{ k.replace(/_/g, ' ') }}</q-btn>
        </div>

        <JsonComparator :values="values" :key-order="keyOrder" @update-value="updateValue">
            <template #default="{text, value, index, which}">
                <template v-if="index[index.length - 1] == '.cardId'">
                    cardId:
                    <q-input
                        class="cardid-input"
                        flat dense outlined
                        :model-value="value"
                        @update:model-value="value => updateValue({
                            index,
                            value: toIdentifier(value as string),
                            which
                        })"
                    />
                </template>
                <span v-else>{{ text }}</span>
            </template>
        </JsonComparator>
    </div>
</template>

<style lang="sass" scoped>
.cardid-input
    flex-basis: 300px

</style>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Notify } from 'quasar';

import controlSetup from 'setup/control';

import JsonComparator from 'components/JSONComparator.vue';

import type { Card } from 'interface/hearthstone/card';

import {
    isEqual, set, uniq, flatten, omit, deburr,
} from 'lodash';

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
    values: Card[];
    initial: { cardId: string, version: number };
};

const { controlGet, controlPost } = controlSetup();

const data = ref<DuplicateData>({
    total:   0,
    values:  [],
    initial: { cardId: '', version: 0 },
});

const total = computed(() => data.value.total);
const initial = computed(() => data.value.initial);

const values = computed({
    get() { return data.value.values; },
    set(newValue) {
        data.value.values = newValue;
    },
});

const loadData = async () => {
    const { data: result } = await controlGet<DuplicateData>('/hearthstone/card/get-duplicate');

    data.value = result;
};

const resolveEnabled = computed(() => uniq(values.value.map(v => v.cardId)).length !== 1
    || values.value.every((v, i, a) => i === a.length - 1 || isEqual(v, a[i + 1])));

const resolveDuplicate = async () => {
    await controlPost('/hearthstone/card/resolve-duplicate', {
        data:    values.value,
        initial: initial.value,
    });

    await loadData();
};

const keyOrder = (key: string, allValues: any[], index: string[]) => {
    if (index.length === 0) {
        switch (key) {
        case 'cardId':
            return 999;
        case 'type':
            return 998;
        default:
            return null;
        }
    } else {
        return null;
    }
};

const toIdentifier = (text: string) => deburr(text)
    .trim()
    .toLowerCase()
    .replace(' // ', '____')
    .replace('/', '____')
    .replace(/[^a-z0-9!:]/g, '_');

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

const omitKey = ['version', 'set', 'entityId'];

const mergeData = () => {
    const allVersion = uniq(flatten(values.value.map(v => v.version)));
    const commonVersion = allVersion.filter(v => values.value.every(o => o.version.includes(v)));

    for (const [i, v] of values.value.entries()) {
        if (i !== 0) {
            const thisJson = omit(v, omitKey);
            const lastJson = omit(values.value[i - 1], omitKey);

            if (!isEqual(thisJson, lastJson)) {
                Notify.create({
                    message: `Card [${i}] is not equal to previous card`,
                    color:   'negative',
                });

                console.log(Object.keys((thisJson as any).localization)
                    .filter(k => !isEqual((thisJson.localization as any)[k], (lastJson.localization as any)[k]))
                    .map(k => ({
                        key:  k,
                        this: (thisJson.localization as any)[k],
                        last: (lastJson.localization as any)[k],
                    })));

                return;
            }
        }
    }

    const commonJson = {
        ...omit(values.value[0], omitKey),
        version:  commonVersion,
        set:      uniq(flatten(values.value.map(v => v.set))),
        entityId: uniq(flatten(values.value.map(v => v.entityId))),
    } as Card;

    const remainingJson = values.value.map(v => ({
        ...v,
        version: v.version.filter(o => !commonVersion.includes(o)),
    }) as Card).filter(v => v.version.length > 0);

    console.dir(commonJson);

    data.value.values = [...remainingJson, commonJson];
};

const rotateData = () => {
    values.value = [...values.value.slice(1), values.value[0]];
};

const resolveSnippets = {
    hero: () => {
        for (const v of values.value) {
            if (v.type === 'hero') {
                v.cardId += '!hero';
            }
        }
    },
    tavern_brawl: () => {
        for (const v of values.value) {
            if (v.set.includes('tb')) {
                v.cardId += ':tavern_brawl';
            }
        }
    },
};

onMounted(loadData);
</script>
