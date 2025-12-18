<template>
    <div class="q-pa-md">
        <div class="flex items-center q-mb-md">
            <q-select v-model="mode" class="q-mr-md" :options="modes" flat dense outlined />

            <span>{{ summaryText }}</span>

            <q-toggle v-model="takeMulti" label="Only Multi" />
            <q-toggle v-model="showImage" class="q-ml-md" label="Show Image" stack-label />
            <q-toggle v-model="massiveChanged" label="Massive Changed" />

            <q-select
                v-model="lang"
                class="lang-selector q-ml-lg"
                :options="['', ...locales]"
                label="Language"
                flat dense outlined
            />
        </div>
        <div class="flex items-center q-mb-md">
            <q-btn outline dense label="Accept All" @click="acceptAllUpdation" />
            <q-btn
                class="q-ml-md" outline dense
                label="Reject All"
                @click="rejectAllUpdation"
            />
            <q-btn
                class="q-ml-md" outline dense
                label="Accept Unchanged"
                @click="acceptUnchanged"
            />

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
            item-key="hash"
            class="legalities"
        >
            <q-card class="q-ma-sm q-pa-sm updation">
                <q-card-section class="flex justify-around">
                    <q-btn
                        class="q-mr-sm" flat dense
                        no-caps
                        @click="commitUpdation(u, 'reject')"
                    >
                        <component :is="() => diffContent(u.oldValue, u.newValue)[0]" />
                    </q-btn>
                </q-card-section>

                <q-card-section class="flex justify-around">
                    <q-btn
                        class="q-mr-sm" flat dense
                        no-caps
                        @click="commitUpdation(u, 'accept')"
                    >
                        <component :is="() => diffContent(u.oldValue, u.newValue)[1]" />
                    </q-btn>
                </q-card-section>

                <q-card-section class="flex justify-around">
                    <q-btn class="q-ml-sm" outline dense @click="acceptAndEdit(u)">
                        Accept & Edit
                    </q-btn>
                </q-card-section>

                <q-card-section>
                    <card-avatar :id="u.cardId" :part="u.partIndex" :version="versionFor(u)" :full-image="showImage" />
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

import Grid from 'components/Grid.vue';
import CardAvatar from 'components/magic/CardAvatar.vue';
import DeferInput from 'components/DeferInput.vue';

import { diffChars, diffString } from '@common/util/diff';

import { locale } from '@model/magic/schema/basic';
import { Updation, UpdationResponse, updationMode } from '@model/magic/schema/data/updation';

import { trpc } from 'src/trpc';

const locales = locale.options;

const router = useRouter();

const data = ref<UpdationResponse>({
    mode:    'card',
    total:   0,
    key:     '',
    current: 0,
    values:  [],
});

const total = computed(() => data.value.total);
const key = computed(() => data.value.key);
const current = computed(() => data.value.current);
const values = computed(() => data.value.values);

const modes = updationMode.options;

const mode = useParam('mode', {
    type:    'enum',
    bind:    'query',
    values:  modes,
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

        result = result.filter(u => {
            if (typeof u.oldValue === 'string') {
                return regex.test(u.oldValue);
            } else {
                return regex.test(JSON.stringify(u.oldValue));
            }
        });
    }

    if (newValueFilter.value !== '') {
        const regex = new RegExp(newValueFilter.value);

        result = result.filter(u => {
            if (typeof u.newValue === 'string') {
                return regex.test(u.newValue);
            } else {
                return regex.test(JSON.stringify(u.newValue));
            }
        });
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

    if (lang.value !== '' && !['card', 'cardPart'].includes(mode.value)) {
        result = result.filter(r => r.lang === lang.value);
    }

    if (takeMulti.value) {
        const map: Record<string, Updation[]> = { };

        for (const updation of result) {
            const index = (() => {
                switch (mode.value) {
                case 'card':
                    return updation.cardId;
                case 'cardLocalization':
                    return `${updation.cardId}:${updation.lang}`;
                case 'cardPart':
                    return `${updation.cardId}:${updation.partIndex}`;
                case 'cardPartLocalization':
                    return `${updation.cardId}:${updation.partIndex}:${updation.lang}`;
                case 'print':
                    return `${updation.cardId}:${updation.set}:${updation.number}:${updation.lang}`;
                case 'printPart':
                    return `${updation.cardId}:${updation.set}:${updation.number}:${updation.lang}:${updation.partIndex}`;
                }
            })();

            map[index] ??= [];
            map[index].push(updation);
        }

        const max = Math.max(...Object.values(map).map(arr => arr.length));

        if (max > 1) {
            result = Object.values(map).filter(arr => arr.length === max).flat();
        } else {
            result = [];
        }
    }

    return result.map((v, i) => {
        const hash = (obj: any) => {
            const str = JSON.stringify(obj, Object.keys(obj).sort());
            // Simple hash function to control length
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            return hash.toString(36); // Convert to base36 for shorter string
        };

        const primaryKey: Record<string, any> = {};

        switch (mode.value) {
        case 'card':
            primaryKey['cardId'] = v.cardId;
            break;
        case 'cardLocalization':
            primaryKey['cardId'] = v.cardId;
            primaryKey['lang'] = v.lang;
            break;
        case 'cardPart':
            primaryKey['cardId'] = v.cardId;
            primaryKey['partIndex'] = v.partIndex;
            break;
        case 'cardPartLocalization':
            primaryKey['cardId'] = v.cardId;
            primaryKey['partIndex'] = v.partIndex;
            primaryKey['lang'] = v.lang;
            break;
        case 'print':
            primaryKey['cardId'] = v.cardId;
            primaryKey['set'] = v.set;
            primaryKey['number'] = v.number;
            primaryKey['lang'] = v.lang;
            break;
        case 'printPart':
            primaryKey['cardId'] = v.cardId;
            primaryKey['set'] = v.set;
            primaryKey['number'] = v.number;
            primaryKey['lang'] = v.lang;
            primaryKey['partIndex'] = v.partIndex;
            break;
        }

        primaryKey.index = i;

        return {
            hash: hash(primaryKey),
            ...v,
        };
    });
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
    data.value = await trpc.magic.data.updation.getMinimal({ mode: mode.value });
};

onMounted(loadData);

watch([mode], loadData);

const versionFor = (updation: Updation) => {
    switch (mode.value) {
    case 'card':
    case 'cardPart':
        return undefined;
    case 'cardLocalization':
    case 'cardPartLocalization':
        return { lang: updation.lang! };
    case 'print':
    case 'printPart':
        return { set: updation.set!, number: updation.number!, lang: updation.lang! };
    }
};

const commitUpdation = async (updation: Updation, action: 'accept' | 'reject') => {
    await trpc.magic.data.updation.commit({ mode: mode.value, action, ...updation });

    await loadData();
};

const acceptAndEdit = async (updation: Updation) => {
    await trpc.magic.data.updation.accept({ mode: mode.value, ...updation });

    await loadData();

    const route = router.resolve({
        name:  'magic/data',
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
        await trpc.magic.data.updation.acceptAll({ mode: mode.value, key: first.key });
        await loadData();
    }
};

const rejectAllUpdation = async () => {
    const first = displayValues.value[0];

    if (first != null) {
        await trpc.magic.data.updation.rejectAll({ mode: mode.value, key: first.key });
        await loadData();
    }
};

const acceptUnchanged = async () => {
    const first = displayValues.value[0];

    if (first != null) {
        await trpc.magic.data.updation.acceptUnchanged({ mode: mode.value, key: first.key });
        await loadData();
    }
};

const commitFirst = async (action: 'accept' | 'reject', count: number) => {
    for (let i = 0; i < count && i < displayValues.value.length; i += 1) {
        const updation = displayValues.value[i];

        if (updation == null) {
            return;
        }

        await trpc.magic.data.updation.commit({ mode: mode.value, action, ...updation });
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
