<template>
    <div class="q-pa-md">
        <div class="flex items-center q-mb-md">
            <span>{{ summaryText }}</span>

            <q-toggle v-model="takeMulti" label="Only Multi" />
            <q-toggle v-model="showImage" class="q-ml-md" label="Show Image" />
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
            class="legalities"
        >
            <q-card class="q-ma-sm q-pa-sm updation">
                <q-card-section>
                    <q-btn class="q-mr-sm" flat dense no-caps @click="commitUpdation(u, 'reject')">
                        <component :is="() => diffContent(u.oldValue, u.newValue)[0]" />
                    </q-btn>
                </q-card-section>

                <q-card-section>
                    <q-btn class="q-mr-sm" flat dense no-caps @click="commitUpdation(u, 'accept')">
                        <component :is="() => diffContent(u.oldValue, u.newValue)[1]" />
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
    h, ref, computed, onMounted,
} from 'vue';

import controlSetup from 'setup/control';
import pageSetup from 'src/setup/page';

import Grid from 'components/Grid.vue';
import CardAvatar from 'components/magic/CardAvatar.vue';
import DeferInput from 'components/DeferInput.vue';

import { diffChars } from 'common/util/diff';

export type ICardUpdation = {
    cardId: string;
    scryfallId: string;
    key: string;
    oldValue: any;
    newValue: any;
};

type CardUpdationData = {
    total: number;
    key: string;
    current: number;
    values: (ICardUpdation & { _id: string })[];
};

const { controlGet, controlPost } = controlSetup();

const data = ref<CardUpdationData>({
    total:   0,
    key:     '',
    current: 0,
    values:  [],
});

const total = computed(() => data.value.total);
const key = computed(() => data.value.key);
const current = computed(() => data.value.current);
const values = computed(() => data.value.values);

const {
    tk : takeMulti,
    si: showImage,
    of: oldValueFilter,
    nf: newValueFilter,
    cc: commitCount,
} = pageSetup({
    params: {
        tk: {
            type:    'boolean',
            bind:    'query',
            default: false,
        },
        si: {
            type:    'boolean',
            bind:    'query',
            default: true,
        },
        of: {
            type:    'string',
            bind:    'query',
            default: '',
        },
        nf: {
            type:    'string',
            bind:    'query',
            default: '',
        },
        cc: {
            type:    'number',
            bind:    'query',
            default: 50,
        },
    },

    appendParam: true,
});

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

    if (takeMulti.value) {
        const counts: Record<string, number> = { };

        for (const updations of values.value) {
            counts[updations.cardId] ??= 0;
            counts[updations.cardId] += 1;
        }

        const max = Math.max(...Object.values(counts));

        result = values.value.filter(u => counts[u.cardId] > 1 && counts[u.cardId] === max);
    }

    return result;
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

    const result = diffChars(lhs, rhs);

    const escape = (text: string) => text.replace(/\n/g, '␤');

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
    const { data: result } = await controlGet<CardUpdationData>('/magic/card/get-updation');

    data.value = result;
};

const versionFor = (updation: ICardUpdation) => {
    const lang = /\[([a-z]+)\]/.exec(updation.key)?.[1];

    return lang != null ? { lang } : undefined;
};

const commitUpdation = async (updation: ICardUpdation & { _id: string }, type: string) => {
    await controlPost('/magic/card/commit-updation', {
        id:  updation._id,
        key: updation.key,
        type,
    });

    await loadData();
};

const acceptAllUpdation = async () => {
    const first = displayValues.value[0];

    if (first != null) {
        await controlPost('/magic/card/accept-all-updation', { key: first.key });
        await loadData();
    }
};

const rejectAllUpdation = async () => {
    const first = displayValues.value[0];

    if (first != null) {
        await controlPost('/magic/card/reject-all-updation', { key: first.key });
        await loadData();
    }
};

const acceptUnchanged = async () => {
    const first = displayValues.value[0];

    if (first != null) {
        await controlPost('/magic/card/accept-unchanged', { key: first.key });
        await loadData();
    }
};

const commitFirst = async (type: 'accept' | 'reject', count: number) => {
    for (let i = 0; i < count && i < displayValues.value.length; i += 1) {
        const updation = displayValues.value[i];

        if (updation == null) {
            return;
        }

        await controlPost('/magic/card/commit-updation', {
            id:  updation._id,
            key: updation.key,
            type,
        });
    }

    await loadData();
};

onMounted(loadData);

</script>

<style lang="sass" scoped>

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
