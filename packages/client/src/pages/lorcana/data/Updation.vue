<template>
    <div class="q-pa-md">
        <div class="flex items-center q-mb-md">
            <q-toggle
                v-model="mode"
                class="q-mr-md"
                false-value="card"
                true-value="print"
                label="Print"
            />

            <span>{{ summaryText }}</span>

            <q-toggle v-model="takeMulti" label="Only Multi" />
            <q-toggle v-model="showImage" class="q-ml-md" label="Show Image" stack-label />
            <q-toggle v-model="massiveChanged" label="Massive Changed" />

            <q-select
                v-model="lang"
                class="lang-selector q-ml-lg"
                :options="['',...locales]"
                label="Language"
                flat dense outlined
            />
        </div>
        <div class="flex items-center q-mb-md">
            <q-btn outline dense label="Accept All" @click="acceptAllUpdation" />
            <q-btn class="q-ml-md" outline dense label="Reject All" @click="rejectAllUpdation" />
            <q-btn class="q-ml-md" outline dense label="Accept Unchanged" @click="acceptUnchanged" />

            <q-btn
                class="q-ml-md"
                outline dense
                :label="'Accept First ' + commitCount"
                @click="commitFirst('accept', commitCount)"
            />

            <q-btn
                class="q-ml-md"
                outline dense
                :label="'Reject First ' + commitCount"
                @click="commitFirst('reject', commitCount)"
            />

            <q-input
                v-model="commitCount"
                class="q-ml-sm" style="width: 100px"
                type="number"
                flat dense outlined
            />

            <defer-input
                v-model="oldValueFilter"
                class="q-ml-sm" style="width: 200px"
                flat dense outlined
                clearable
            />

            <q-icon name="mdi-arrow-right" class="q-mx-sm" />

            <defer-input
                v-model="newValueFilter"
                style="width: 200px"
                flat dense outlined
                clearable
            />
        </div>

        <grid
            v-slot="u"
            :value="displayValues" :item-width="320"
            item-key="index"
            class="legalities"
        >
            <q-card class="q-ma-sm q-pa-sm updation">
                <q-card-section class="flex justify-around">
                    <q-btn class="q-mr-sm" flat dense no-caps @click="commitUpdation(u, 'reject')">
                        <component :is="() => diffContent(u.oldValue, u.newValue)[0]" />
                    </q-btn>
                </q-card-section>

                <q-card-section class="flex justify-around">
                    <q-btn class="q-mr-sm" flat dense no-caps @click="commitUpdation(u, 'accept')">
                        <component :is="() => diffContent(u.oldValue, u.newValue)[1]" />
                    </q-btn>
                </q-card-section>

                <q-card-section class="flex justify-around">
                    <q-btn class="q-ml-sm" outline dense @click="acceptAndEdit(u)">
                        Accept & Edit
                    </q-btn>
                </q-card-section>

                <q-card-section>
                    <card-avatar :id="u.cardId" :version="versionFor(u)" :full-image="showImage" />
                </q-card-section>
            </q-card>
        </grid>
    </div>
</template>

<script setup lang="ts">

import {
    h, ref, computed, watch, onMounted,
} from 'vue';

import { useRouter } from 'vue-router';
import { useParam } from 'store/core';

import controlSetup from 'setup/control';

import Grid from 'components/Grid.vue';
import CardAvatar from 'components/lorcana/CardAvatar.vue';
import DeferInput from 'components/DeferInput.vue';

import { diffChars, diffString } from '@common/util/diff';

import { locales } from '@static/lorcana/basic';

export type Updation = {
    cardId:     string;
    set?:       string;
    number?:    string;
    lang?:      string;
    scryfallId: string;
    key:        string;
    oldValue:   any;
    newValue:   any;
};

type UpdationData = {
    total:   number;
    key:     string;
    current: number;
    values:  (Updation & { _id: string })[];
};

const router = useRouter();

const { controlGet, controlPost } = controlSetup();

const data = ref<UpdationData>({
    total:   0,
    key:     '',
    current: 0,
    values:  [],
});

const total = computed(() => data.value.total);
const key = computed(() => data.value.key);
const current = computed(() => data.value.current);
const values = computed(() => data.value.values);

const mode = useParam('mode', {
    type:    'enum',
    bind:    'query',
    values:  ['card', 'print'],
    default: 'card',
});

const lang = useParam('lang', {
    type:    'string',
    bind:    'query',
    default: '',
});

const takeMulti = useParam('takeMulti', {
    type:    'boolean',
    bind:    'query',
    name:    'tk',
    default: false,
});

const showImage = useParam('showImage', {
    type:    'boolean',
    bind:    'query',
    name:    'si',
    default: true,
});

const oldValueFilter = useParam('oldValueFilter', {
    type:    'string',
    bind:    'query',
    name:    'of',
    default: '',
});

const newValueFilter = useParam('newValueFilter', {
    type:    'string',
    bind:    'query',
    name:    'nf',
    default: '',
});

const commitCount = useParam('commitCount', {
    type:    'number',
    bind:    'query',
    name:    'cc',
    default: 50,
});

const massiveChanged = useParam('massiveChanged', {
    type:    'boolean',
    bind:    'query',
    name:    'mc',
    default: false,
});

const diffValue = (lhs: string, rhs: string) => {
    if (['ja', 'zhs', 'zht', 'ko'].includes(lang.value)) {
        return diffChars(lhs, rhs);
    }

    if (key.value.includes('[ja]') || key.value.includes('[zhs]') || key.value.includes('[zht]') || key.value.includes('[ko]')) {
        return diffChars(lhs, rhs);
    }

    return diffString(lhs, rhs);
};

const filteredValues = computed(() => {
    let result = values.value;

    if (oldValueFilter.value !== '') {
        const regex = new RegExp(oldValueFilter.value);

        result = result.filter(u => regex.test(u.oldValue));
    }

    if (newValueFilter.value !== '') {
        const regex = new RegExp(newValueFilter.value);

        result = result.filter(u => regex.test(u.newValue));
    }

    if (massiveChanged.value) {
        result = result.filter(u => {
            if (typeof u.oldValue !== 'string' || typeof u.newValue !== 'string') {
                return false;
            }

            const diffs = diffValue(u.oldValue, u.newValue);

            return diffs.length >= 10;
        });
    }

    if (lang.value !== '' && mode.value !== 'card') {
        result = result.filter(r => r.lang === lang.value);
    }

    if (takeMulti.value) {
        const counts: Record<string, number> = { };

        for (const updations of result) {
            counts[updations.cardId] ??= 0;
            counts[updations.cardId] += 1;
        }

        const max = Math.max(...Object.values(counts));

        if (max > 1) {
            result = result.filter(u => counts[u.cardId] === max);
        } else {
            result = [];
        }
    }

    if (mode.value === 'card') {
        return result.map((v, i) => ({ index: v._id + i, ...v }));
    } else {
        return result.map(v => ({ index: v._id, ...v }));
    }
});

const displayValues = computed(() => filteredValues.value.slice(0, 100));

const summaryText = computed(() => {
    if (filteredValues.value.length !== values.value.length) {
        return `${key.value} ${filteredValues.value.length}(${current.value}) / ${total.value}`;
    } else {
        return `${key.value} ${current.value} / ${total.value}`;
    }
});

const diffContent = (lhs: string, rhs: string) => {
    if (typeof lhs !== 'string' || typeof rhs !== 'string') {
        return [
            lhs == null ? '<null>' : JSON.stringify(lhs),
            rhs == null ? '<null>' : JSON.stringify(rhs),
        ];
    }

    const result = diffValue(lhs, rhs);

    const escape = (text: string) => text
        .replace(/\n/g, '␤')
        .replace(/^ | $/g, '\xA0');

    return [
        result.map(v => {
            if (typeof v === 'string') {
                return escape(v);
            } else {
                return h('span', { class: 'diff-old' }, escape(v[0]));
            }
        }),
        result.map(v => {
            if (typeof v === 'string') {
                return escape(v);
            } else {
                return h('span', { class: 'diff-new' }, escape(v[1]));
            }
        }),
    ];
};

const loadData = async () => {
    const { data: result } = await controlGet<UpdationData>(`/lorcana/${mode.value}/get-updation`);

    data.value = result;
};

onMounted(loadData);

watch([mode], loadData);

const versionFor = (updation: Updation) => {
    if (mode.value === 'card') {
        const langFilter = /\[([a-z]+)\]/.exec(updation.key)?.[1];

        return lang != null ? { lang: langFilter! } : undefined;
    } else {
        return { set: updation.set!, number: updation.number!, lang: updation.lang! };
    }
};

const commitUpdation = async (updation: Updation & { _id: string }, type: string) => {
    await controlPost(`/lorcana/${mode.value}/commit-updation`, {
        id:  updation._id,
        key: updation.key,
        type,
    });

    await loadData();
};

const acceptAndEdit = async (updation: Updation & { _id: string }) => {
    await controlPost(`/lorcana/${mode.value}/commit-updation`, {
        id:  updation._id,
        key: updation.key,
    });

    await loadData();

    const route = router.resolve({
        name:  'lorcana/data',
        query: {
            tab:    'Editor',
            id:     updation.cardId,
            lang:   updation.lang,
            set:    updation.set,
            number: updation.number,
        },
    });

    window.open(route.href, '_blank');
};

const acceptAllUpdation = async () => {
    const first = displayValues.value[0];

    if (first != null) {
        await controlPost(`/lorcana/${mode.value}/accept-all-updation`, { key: first.key });
        await loadData();
    }
};

const rejectAllUpdation = async () => {
    const first = displayValues.value[0];

    if (first != null) {
        await controlPost(`/lorcana/${mode.value}/reject-all-updation`, { key: first.key });
        await loadData();
    }
};

const acceptUnchanged = async () => {
    const first = displayValues.value[0];

    if (first != null) {
        await controlPost(`/lorcana/${mode.value}/accept-unchanged`, { key: first.key });
        await loadData();
    }
};

const commitFirst = async (type: 'accept' | 'reject', count: number) => {
    for (let i = 0; i < count && i < displayValues.value.length; i += 1) {
        const updation = displayValues.value[i];

        if (updation == null) {
            return;
        }

        await controlPost(`/lorcana/${mode.value}/commit-updation`, {
            id:  updation._id,
            key: updation.key,
            type,
        });
    }

    await loadData();
};

</script>

<style lang="sass" scoped>

.lang-selector
    min-width: 150px

.updation
    border: 1px solid grey
    border-radius: 5px

    max-width: 320px
    flex-basis: 320px

.action:deep(.q-btn)
    padding: 0

.q-card__section:deep(.diff-old)
    background-color: $red-2

.q-card__section:deep(.diff-new)
    background-color: $green-2

</style>
