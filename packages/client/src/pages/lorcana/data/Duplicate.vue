<template>
    <div class="q-pa-md">
        <div class="q-mb-md">
            <span>{{ total }}</span>

            <q-btn class="q-mx-md" outline dense :disable="!allSame" @click="resolveDuplicate">
                Resolve
            </q-btn>

            <card-avatar v-if="id != null && version != null" :id="id" :version="version" use-lang />
        </div>

        <json-comparator :values="values" @update-value="updateValue" />
    </div>
</template>

<script lang="ts">

import {
    defineComponent, ref, computed, onMounted,
} from 'vue';

import controlSetup from 'setup/control';

import { Print } from '@interface/lorcana/print';

import JsonComparator from 'components/JSONComparator.vue';
import CardAvatar from 'components/lorcana/CardAvatar.vue';

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

type DuplicateData = {
    total:  number;
    values: (Print & { _id: string })[];
};

export default defineComponent({
    components: { JsonComparator, CardAvatar },

    setup() {
        const { controlGet, controlPost } = controlSetup();

        const data = ref<DuplicateData>({
            total:  0,
            values: [],
        });

        const total = computed(() => data.value.total);
        const values = computed(() => data.value.values);

        const id = computed(() => values.value[0]?.cardId);

        const version = computed(() => {
            const first = values.value[0];

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
            const { data: result } = await controlGet<DuplicateData>('/lorcana/print/get-duplicate');

            data.value = result;
        };

        const resolveDuplicate = async () => {
            const value = values.value[0];

            if (value == null) {
                return;
            }

            await controlPost('/lorcana/print/resolve-duplicate', { data: value });

            await loadData();
        };

        onMounted(loadData);

        return {
            total,
            values,
            id,
            version,
            allSame,

            updateValue,
            resolveDuplicate,
        };
    },
});
</script>
