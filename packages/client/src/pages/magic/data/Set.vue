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
                label="Fill link"
                outline
                @click="fillLink"
            />
            <q-btn
                icon="mdi-upload"
                flat dense round
                @click="save"
            />
        </div>

        <div class="q-mb-sm">
            <tap-btn-toggle
                v-model="tapStyle"
                class="q-mr-sm"
                dense outline
                :options="tapStyleOption"
            >
                <template #old1>
                    <magic-symbol value="{T}" :type="['tap:old1']" />
                </template>

                <template #old2>
                    <magic-symbol value="{T}" :type="['tap:old2']" />
                </template>

                <template #modern>
                    <magic-symbol value="{T}" />
                </template>
            </tap-btn-toggle>

            <white-btn-toggle
                v-model="whiteStyle"
                class="q-mr-sm"
                dense outline
                :options="whiteStyleOption"
            >
                <template #old>
                    <magic-symbol value="{W}" :type="['white:old']" />
                </template>

                <template #modern>
                    <magic-symbol value="{W}" />
                </template>
            </white-btn-toggle>

            <q-checkbox
                v-model="flat"
                class="q-mr-sm"
                label="Flat"
            />

            <span>{{ symbolStyle }}</span>
        </div>

        <div>
            <div v-for="l in localization" :key="l.lang" class="row items-center q-gutter-md">
                <div class="code" style="flex-basis: 25px">
                    {{ l.lang }}
                </div>
                <q-checkbox
                    :model-value="l.isOfficialName"
                    :disable="l.name == null"
                    @update:model-value="() => toggleIsWotcName(l.lang)"
                />
                <q-input
                    :model-value="l.name"
                    class="col"
                    dense outlined
                    @update:model-value="v => assignName(l.lang, v as string)"
                />
                <q-input
                    :model-value="l.link"
                    class="col"
                    dense outlined
                    @update:model-value="v => assignLink(l.lang, v as string)"
                />
                <q-btn
                    type="a" :href="l.link" target="_blank"
                    :disable="l.link == null"
                    icon="mdi-link"
                    flat round dense
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import {
    VNode, ref, computed, watch, onMounted,
} from 'vue';

import { QBtnToggle } from 'quasar';
import type {
    GlobalComponentConstructor, QSelectProps, QBtnToggleProps, QBtnToggleSlots,
} from 'quasar';

import { useRouter, useRoute } from 'vue-router';
import { useGame } from 'store/games/magic';

import controlSetup from 'setup/control';

import MagicSymbol from 'components/magic/Symbol.vue';

import { Set, SetLocalization } from '@interface/magic/set';

import { apiGet } from 'boot/server';

interface TapBtnGroupSlots extends QBtnToggleSlots {
    old1:   () => VNode[];
    old2:   () => VNode[];
    modern: () => VNode[];
}

interface WhiteBtnGroupSlots extends QBtnToggleSlots {
    old:    () => VNode[];
    modern: () => VNode[];
}

const TapBtnToggle = QBtnToggle as
    unknown as GlobalComponentConstructor<QBtnToggleProps, TapBtnGroupSlots>;

const WhiteBtnToggle = QBtnToggle as
    unknown as GlobalComponentConstructor<QBtnToggleProps, WhiteBtnGroupSlots>;

function symbolStyleOf(tap: string, white: string, flat: boolean) {
    const result = [];

    if (tap !== 'modern') {
        result.push(`tap:${tap}`);
    }

    if (white !== 'modern') {
        result.push(`white:${white}`);
    }

    if (flat) {
        result.push('flat');
    }

    return result;
}

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

const symbolStyle = computed(() => data.value?.symbolStyle ?? []);

const tapStyle = computed({
    get() {
        if (symbolStyle.value.includes('tap:old1')) {
            return 'old1';
        } else if (symbolStyle.value.includes('tap:old2')) {
            return 'old2';
        } else {
            return 'modern';
        }
    },
    set(newValue: string) {
        if (data.value == null) {
            return;
        }

        data.value.symbolStyle = symbolStyleOf(newValue, whiteStyle.value, flat.value);
    },
});

const tapStyleOption = [
    { value: 'old1', slot: 'old1' },
    { value: 'old2', slot: 'old2' },
    { value: 'modern', slot: 'modern' },
];

const whiteStyle = computed({
    get() {
        if (symbolStyle.value.includes('white:old')) {
            return 'old';
        } else {
            return 'modern';
        }
    },
    set(newValue: string) {
        if (data.value == null) {
            return;
        }

        data.value.symbolStyle = symbolStyleOf(tapStyle.value, newValue, flat.value);
    },
});

const whiteStyleOption = [
    { value: 'old', slot: 'old' },
    { value: 'modern', slot: 'modern' },
];

const flat = computed({
    get() {
        return symbolStyle.value.includes('flat');
    },
    set(newValue: boolean) {
        if (data.value == null) {
            return;
        }

        data.value.symbolStyle = symbolStyleOf(tapStyle.value, whiteStyle.value, newValue);
    },
});

const loadList = async () => {
    const { data: sets } = await apiGet<string[]>('/magic/set');

    set.value = sets;

    if (data.value == null) {
        void loadData();
    }
};

const loadData = async () => {
    if (data.value != null) {
        await save();
    }

    const { data: result } = await controlGet<Set>('/magic/set/raw', {
        id: id.value,
    });

    data.value = result;
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

const assignLink = (lang: string, link: string) => {
    if (data.value == null) {
        return;
    }

    const loc = data.value.localization.find(l => l.lang === lang);

    if (loc == null) {
        data.value.localization = [
            ...data.value.localization,
            { lang, name: '', link },
        ];
    } else {
        loc.link = link;
    }
};

const toggleIsWotcName = (lang: string) => {
    if (data.value == null) {
        return;
    }

    const loc = data.value.localization.find(l => l.lang === lang);

    if (loc != null) {
        loc.isOfficialName = !loc.isOfficialName;
    }
};

type FillLink = Record<string, { link: string, name: string }>;

const fillLink = async () => {
    if (data.value == null) {
        return;
    }

    const enLink = data.value.localization.find(l => l.lang === 'en')?.link;

    if (enLink == null) { return; }

    const { data: linkMap } = await controlGet<FillLink>('magic/set/fill-link', {
        link: enLink,
    });

    console.log(linkMap);

    for (const [l, v] of Object.entries(linkMap)) {
        assignLink(l, v.link);

        const locName = localization.value.find(loc => loc.lang === l)?.name;

        if (locName === '' || locName == null) {
            assignName(l, v.name);
        }
    }
};

const prettify = () => {
    if (data.value == null) {
        return;
    }

    data.value.localization = data.value.localization.filter(
        l => (l.name != null && l.name !== '') || (l.link != null && l.link !== ''),
    );

    for (const l of data.value.localization) {
        if (l.name === '') {
            delete l.name;
            delete l.isOfficialName;
        }

        if (l.link === '') {
            delete l.link;
        }
    }
};

const save = async () => {
    if (data.value != null) {
        prettify();

        await controlPost('/magic/set/save', { data: data.value });
    }
};

const calcField = async () => {
    await controlPost('/magic/set/calc', { id: id.value });
};

watch(set, () => { filteredSet.value = set.value; });
watch(id, loadData);
onMounted(loadList);
</script>
