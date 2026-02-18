<template>
    <div class="q-pa-md row">
        <div class="card-image col-3 q-mr-md">
            <card-image
                v-if="data != null"
                v-model:part="partIndex"
                :lang="lang"
                :set="set"
                :number="number"
                :layout="layout"
                :full-image-type="fullImageType"
                :refresh-token="refreshToken"
            />
            <div class="history q-mt-md">
                <div class="code text-center">{{ history.length }}</div>
                <div
                    v-for="(h, i) in history.slice(0, 5)"
                    :key="i"
                    class="flex justify-center"
                >
                    <card-avatar :id="h.id" :version="h" use-lang />
                </div>
            </div>
        </div>
        <div class="col">
            <div class="q-mb-md flex items-center">
                <q-input v-model="search" class="search col-grow" outlined dense @keypress.enter="doSearch">
                    <template #prepend>
                        <q-select v-model="groupBy" class="q-mr-md" :options="['print', 'locale', 'card']" outlined dense />
                    </template>

                    <template #append>
                        <q-btn
                            icon="mdi-magnify"
                            dense flat round
                            @click="doSearch"
                        />
                    </template>
                </q-input>
            </div>
            <div class="q-mb-md flex items-center">
                <q-select v-model="selectedLocale" class="q-mr-md" :options="locales" outlined dense />

                <q-btn-group outline>
                    <q-btn outline label="paren" @click="loadGroup('paren')" />
                    <q-btn outline label="keyword" @click="loadGroup('keyword')" />
                </q-btn-group>

                <q-space />

                <q-btn
                    class="q-mx-md"
                    outline
                    style="padding: 4px 8px"
                    @click="prettify"
                >
                    <q-btn
                        flat round dense
                        :icon="forcePrettify ? 'mdi-lock' : 'mdi-lock-open'"
                        :color="forcePrettify ? 'primary' : 'black'"
                        size="sm"
                        class="q-mr-sm"
                        @click.stop="forcePrettify = !forcePrettify"
                    />
                    Prettify
                </q-btn>

                <q-btn
                    icon="mdi-alpha-u-circle-outline"
                    :color="replaceUnified ? 'primary' : 'black'"
                    dense flat round
                    @click="replaceUnified = !replaceUnified"
                />

                <q-btn
                    icon="mdi-alpha-p-circle-outline"
                    :color="replacePrinted ? 'primary' : 'black'"
                    dense flat round
                    @click="replacePrinted = !replacePrinted"
                />

                <q-input v-model="replaceFrom" class="inline-flex" dense />
                <q-icon name="mdi-arrow-right" class="q-mx-md" />
                <q-input v-model="replaceTo" class="inline-flex" dense />
            </div>

            <div class="id-line flex items-center">
                <q-icon
                    class="q-mr-md"
                    :name="inDatabase ? 'mdi-database-check' : 'mdi-database-remove'"
                    :color="inDatabase ? undefined : 'red'"
                    size="sm"
                />

                <q-input
                    v-if="unlock"
                    v-model="id"
                    :class="fieldClasses.cardId"
                    class="id code"
                    style="width: 200px;"
                    dense outlined
                />

                <q-btn
                    v-else
                    icon="mdi-identifier"
                    :color="id == null ? 'red' : undefined"
                    flat round dense
                    @click="copyToClipboard(id)"
                >
                    <q-tooltip>{{ id }}</q-tooltip>
                </q-btn>

                <div v-if="unlock" class="info flex items-center q-mx-md">
                    <q-input v-model="locale" :class="fieldClasses.locale" style="width: 60px;" outlined dense />
                    /
                    <q-input v-model="lang" :class="fieldClasses.lang" style="width: 60px;" outlined dense />
                    {{ `:${set},${number}` }}
                </div>

                <div v-else class="info q-mx-md">{{ info }}</div>

                <q-select v-model="layout" :class="fieldClasses['card.layout']" class="q-mr-md" :options="layoutOptions" outlined dense />

                <q-select v-model="imageStatus" :class="fieldClasses['print.imageStatus']" class="q-mr-md" :options="imageStatusOptions" outlined dense />

                <q-select v-model="fullImageType" :class="fieldClasses['print.fullImageType']" class="q-mr-md" :options="fullImageTypeOptions" outlined dense />

                <q-btn-toggle
                    v-if="partCount > 1"
                    v-model="partIndex"
                    class="q-mr-md"
                    :options="partOptions"
                    outline dense
                />

                <div>{{ releaseDate }}</div>

                <span v-if="dataGroup != null" class="q-ml-md">{{ `${total} (${loaded})` }}</span>

                <q-space />

                <remote-btn
                    ref="reloadCardImageBtn"
                    icon="mdi-image"
                    dense flat round
                    :remote="reloadCardImage"
                    :resolve="applyReloadCardImage"
                />

                <q-btn
                    v-if="devToken"
                    color="red" icon="mdi-card-outline"
                    dense flat round
                    @click="devToken = false"
                />

                <q-btn
                    v-if="devCounter"
                    color="red" icon="mdi-hexagon-multiple-outline"
                    dense flat round
                    @click="devCounter = false"
                />

                <q-btn
                    icon="mdi-link"
                    dense flat round
                    :to="cardLink"
                    target="_blank"
                />

                <q-btn icon="mdi-new-box" dense flat round @click="newData" />
                <q-btn icon="mdi-scale-balance" dense flat round @click="getLegality" />
                <q-btn icon="mdi-book" dense flat round @click="extractRulingCards" />

                <q-btn
                    icon="mdi-card-multiple-outline"
                    :color="sample ? 'primary' : 'black'"
                    dense flat round
                    @click="sample = !sample"
                />

                <q-btn icon="mdi-skip-next" dense flat round @click="skipCurrent" />
                <q-btn icon="mdi-refresh" dense flat round @click="() => loadData()" />
                <q-btn
                    icon="mdi-compare"
                    :color="hasModifications ? 'green' : 'grey'"
                    dense flat round
                    @click="resetComparison"
                >
                    <q-badge v-if="modifiedFieldsCount > 0" color="red" floating>{{ modifiedFieldsCount }}</q-badge>
                </q-btn>
                <q-btn icon="mdi-upload" dense flat round @click="doUpdate" />
            </div>

            <table>
                <tr>
                    <th>
                        <div class="flex justify-center items-center">
                            <span class="q-mx-sm">Oracle</span>

                            <q-toggle
                                v-if="oracleUpdated"
                                v-model="showBeforeOracle"
                                icon="mdi-history"
                                dense flat round size="sm"
                            />

                            <q-btn
                                v-if="lang == 'en'"
                                icon="mdi-menu-right"
                                dense flat round size="sm"
                                @click="oracleOverwriteUnified"
                            />

                            <q-btn
                                :icon="unlock ? 'mdi-lock-open' : 'mdi-lock'"
                                dense flat round size="sm"
                                @click="unlock = !unlock"
                            />
                        </div>
                    </th>
                    <th>
                        <div class="flex justify-center items-center">
                            <q-btn
                                :color="devOracleColor" icon="mdi-alpha-o-circle-outline"
                                dense flat round size="sm"
                                @click="clickDevOracle"
                            />

                            <q-btn
                                :color="devUnifiedColor" icon="mdi-alert-circle-outline"
                                dense flat round size="sm"
                                @click="clickDevUnified"
                            />

                            <span class="q-mx-sm">Unified</span>

                            <q-btn
                                icon="mdi-ab-testing"
                                :color="separateKeyword ? 'primary' : 'black'"
                                dense flat round size="sm"
                                @click="separateKeyword = !separateKeyword"
                            />
                        </div>
                    </th>
                    <th>
                        <div class="flex justify-center items-center">
                            <q-btn
                                :color="devPrintedColor" icon="mdi-alert-circle-outline"
                                dense flat round size="sm"
                                @click="clickDevPrinted"
                            />

                            <span class="q-mx-sm">Printed</span>

                            <q-btn
                                icon="mdi-menu-left"
                                dense flat round size="sm"
                                @click="printedOverwriteUnified"
                            />

                            <remote-btn
                                v-if="currentMultiverseId != null"
                                ref="parseGathererBtn"
                                icon="mdi-alpha-g-circle"
                                dense flat round size="sm"
                                :remote="parseGathererDefault"
                                :resolve="applyParseGatherer"
                            >
                                <q-menu
                                    touch-position
                                    context-menu
                                >
                                    <q-btn-group size="sm">
                                        <q-btn size="sm" icon="mdi-lock" flat dense />
                                    </q-btn-group>
                                </q-menu>
                            </remote-btn>

                            <remote-btn
                                v-if="lang === 'zhs'"
                                ref="getMtgchBtn"
                                icon="mdi-alpha-c-circle"
                                dense flat round size="sm"
                                :remote="getMtgch"
                                :resolve="applyMtgch"
                            />

                            <remote-btn
                                v-if="cloningTextEnabled"
                                ref="getCloningSourceBtn"
                                icon="mdi-magnify"
                                dense flat round size="sm"
                                :remote="getCloningSourceText"
                                :resolve="applyCloningSourceText"
                            />

                            <remote-btn
                                ref="scanCardTextBtn"
                                icon="mdi-credit-card-scan-outline"
                                dense flat round size="sm"
                                :remote="scanCardText"
                                :resolve="applyScanCardText"
                            />
                        </div>
                    </th>
                </tr>
                <tr>
                    <td>
                        <q-input
                            v-model="oracleName"
                            :class="fieldClasses['cardPart.name']"
                            tabindex="1" :readonly="!unlock"
                            outlined dense
                        />
                    </td>
                    <td><q-input v-model="unifiedName" :class="fieldClasses['cardPartLocalization.name']" tabindex="2" outlined dense /></td>
                    <td><q-input v-model="printedName" :class="fieldClasses['printPart.name']" tabindex="3" outlined dense /></td>
                </tr>
                <tr>
                    <td>
                        <q-input
                            v-model="oracleTypeline"
                            :class="fieldClasses['cardPart.typeline']"
                            tabindex="1" :readonly="!unlock"
                            outlined dense
                        />
                    </td>
                    <td><q-input v-model="unifiedTypeline" :class="fieldClasses['cardPartLocalization.typeline']" tabindex="2" outlined dense /></td>
                    <td><q-input v-model="printedTypeline" :class="fieldClasses['printPart.typeline']" tabindex="3" outlined dense /></td>
                </tr>
                <tr class="text">
                    <td>
                        <q-input
                            v-model="displayOracleText"
                            :class="fieldClasses['cardPart.text']"
                            tabindex="1"
                            :readonly="!unlock && !(oracleUpdated && showBeforeOracle)"
                            :filled="oracleUpdated && showBeforeOracle"
                            outlined type="textarea" dense
                        />
                    </td>
                    <td><q-input v-model="unifiedText" :class="fieldClasses['cardPartLocalization.text']" tabindex="2" outlined type="textarea" dense /></td>
                    <td><q-input v-model="printedText" :class="fieldClasses['printPart.text']" tabindex="3" outlined type="textarea" dense /></td>
                </tr>
            </table>

            <q-input v-model="flavorText" :class="fieldClasses['printPart.flavorText']" class="q-mt-sm" autogrow label="Flavor Text" outlined type="textarea">
                <template #append>
                    <remote-btn
                        ref="scanFlavorTextBtn"
                        icon="mdi-credit-card-scan-outline"
                        dense flat round size="sm"
                        :remote="scanCardText"
                        :resolve="applyScanFlavorText"
                    />

                    <remote-btn
                        v-if="lang === 'zhs'"
                        ref="getMtgchFlavorBtn"
                        icon="mdi-alpha-c-circle"
                        dense flat round size="sm"
                        :remote="getMtgch"
                        :resolve="applyMtgchFlavor"
                    />
                </template>
            </q-input>

            <div class="flex q-mt-sm">
                <q-input v-model="flavorName" :class="fieldClasses['printPart.flavorName']" class="col" label="Flavor Name" outlined dense />

                <!-- eslint-disable-next-line max-len -->
                <array-input v-model="multiverseId" :class="fieldClasses['print.multiverseId']" class="col q-ml-sm" label="Multiverse ID" is-number outlined dense>
                    <template #append>
                        <remote-btn ref="saveGathererImageBtn" icon="mdi-image" dense flat round :remote="saveGathererImage" :resolve="applySaveGathererImage" />
                    </template>
                </array-input>
            </div>

            <div class="flex q-mt-sm">
                <q-input
                    v-model="relatedCardsString"
                    class="col" debounce="500"
                    :disable="dataGroup?.method != null && !dataGroup.method.startsWith('search:')"
                    label="Related Cards"
                    outlined dense
                >
                    <template #append>
                        <q-btn icon="mdi-card-plus-outline" dense flat round @click="guessToken" />
                    </template>
                </q-input>

                <array-input v-model="counters" class="col q-ml-sm" label="Counters" outlined dense>
                    <template #append>
                        <q-btn icon="mdi-magnify" dense flat round @click="guessCounter" />
                    </template>
                </array-input>
            </div>

            <div>
                <div v-for="(v, k) in lockedPaths" :key="k">
                    locked[{{ k }}]: {{ v.join(', ') }}
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, ComputedRef, useTemplateRef } from 'vue';

import { useRouter, useRoute } from 'vue-router';
import { useParam } from 'store/core';
import { useGame } from 'store/games/magic';

import ArrayInput from 'components/ArrayInput.vue';
import RemoteBtn from 'components/RemoteBtn.vue';
import CardImage from 'components/magic/CardImage.vue';
import CardAvatar from 'components/magic/CardAvatar.vue';

import { Locale, Layout, locale as localeEnum } from '@model/magic/schema/basic';
import { CardEditorView } from '@model/magic/schema/print';

import {
    at, cloneDeep, debounce, deburr, escapeRegExp, isEqual, mapValues, uniq, upperFirst,
} from 'lodash';

import { copyToClipboard } from 'quasar';

import { parenRegex, commaRegex } from '@static/magic/special';
import withComma from '@data/magic/special/with-comma.yml';
import withParen from '@data/magic/special/with-paren.yml';

import { trpc } from 'src/trpc';

type CardGroup = {
    method: string;
    result: CardEditorView[];
    total:  number;
};

type History = {
    id:     string;
    locale: Locale;
    set:    string;
    number: string;
    lang:   Locale;
};

const colorMap: Record<string, string> = {
    'white':           'w',
    'blue':            'u',
    'black':           'b',
    'red':             'r',
    'green':           'g',
    'colorless':       'c',
    'white and black': 'wb',
    'white and blue':  'wu',
    'blue and black':  'ub',
    'blue and red':    'ur',
    'black and red':   'br',
    'black and green': 'bg',
    'red and green':   'rg',
    'red and white':   'wr',
    'green and blue':  'ug',
    'green and white': 'wg',
    'pink':            'p',
    'gold':            'o',
};

const keywordMap: Record<string, string> = {
    'changeling':   'c',
    'deathtouch':   'd',
    'defender':     'e',
    'first strike': 's',
    'flying':       'f',
    'haste':        'h',
    'hexproof':     'x',
    'lifelink':     'l',
    'menace':       'm',
    'reach':        'r',
    'trample':      't',
    'vigilance':    'v',
    'prowess':      'p',
};

const predefinedNames = ['Gold', 'Clue', 'Treasure', 'Food', 'Walker', 'Shard', 'Blood', 'Powerstone', 'Map', 'Junk', 'Lander', 'Mutagen'];

const numberRegex = '(?:[a-z]+|a number of|(?:twice )?(?:X|that many))';

const statsRegex = '(?:\\d+|X)/(?:\\d+|X)';
const colorRegex = `(?:${Object.keys(colorMap).join('|')})`;
const subtypeRegex = '[A-Z][a-z]+(?:-[A-Z][a-z]+)?';
const subtypesRegex = `${subtypeRegex}(?: ${subtypeRegex})*`;
const typeRegex = 'artifact|enchantment';
const abilityRegex = '(?:[a-z]+|"[^"]+")';
const abilitiesRegex = `${abilityRegex}(?: and ${abilityRegex})*`;

const creatureRegex = `${numberRegex}(?: (?:tapped|tapped and attacking))?(?: (${statsRegex}))? (${colorRegex}) (${subtypesRegex}) (?:(?:${typeRegex}) )?creature tokens?(?: with (${abilitiesRegex}))?`;

const predefinedRegex = `${numberRegex}(?: tapped)? (${predefinedNames.join('|')}|colorless Clue artifact) tokens?`;
const roleRegex = `${numberRegex}(?: tapped)? ([A-Z][a-z]+|[A-Z][a-z]+ [A-Z][a-z]+) Role tokens?`;

const guessRegex = new RegExp(`[Cc]reates? (?:${creatureRegex}|${predefinedRegex}|${roleRegex})`, 'g');
const predefinedCheckRegex = new RegExp(predefinedRegex);

const counterBlacklist = [
    'a',
    'all',
    'and',
    'another',
    'each',
    'had',
    'has',
    'have',
    'its',
    'more',
    'moved',
    'no',
    'of',
    'that',
    'the',
    'those',
    'three',
    'with',
    'X',
];

const router = useRouter();
const route = useRoute();
const game = useGame();

const data = ref<CardEditorView>();
const originalData = ref<CardEditorView>();
const dataGroup = ref<CardGroup>();
const history = ref<History[]>([]);
const unlock = ref(false);

// Template refs for remote buttons
const reloadCardImageBtn = useTemplateRef('reloadCardImageBtn');
const parseGathererBtn = useTemplateRef('parseGathererBtn');
const getMtgchBtn = useTemplateRef('getMtgchBtn');
const getCloningSourceBtn = useTemplateRef('getCloningSourceBtn');
const scanCardTextBtn = useTemplateRef('scanCardTextBtn');
const scanFlavorTextBtn = useTemplateRef('scanFlavorTextBtn');
const getMtgchFlavorBtn = useTemplateRef('getMtgchFlavorBtn');
const saveGathererImageBtn = useTemplateRef('saveGathererImageBtn');

const remoteBtns = computed(() => [
    reloadCardImageBtn.value,
    parseGathererBtn.value,
    getMtgchBtn.value,
    getCloningSourceBtn.value,
    scanCardTextBtn.value,
    scanFlavorTextBtn.value,
    getMtgchFlavorBtn.value,
    saveGathererImageBtn.value,
].filter(Boolean));

const locales = ['', ...localeEnum.options];

const selectedLocale = useParam('locale', {
    type:    'enum',
    bind:    'query',
    values:  locales,
    default: '',
});

const sample = useParam('sample', {
    type:    'boolean',
    bind:    'query',
    name:    'sp',
    default: true,
});

const groupBy = useParam('filterBy', {
    type:    'enum',
    bind:    'query',
    name:    'fb',
    values:  ['print', 'locale', 'card'],
    default: 'print',
});

const forcePrettify = useParam('forcePrettify', {
    type:    'boolean',
    bind:    'query',
    name:    'fp',
    default: false,
});

const separateKeyword = useParam('separateKeyword', {
    type:    'boolean',
    bind:    'query',
    name:    'sk',
    default: false,
});

const replaceUnified = useParam('replaceUnified', {
    type:    'boolean',
    bind:    'query',
    name:    'ru',
    default: false,
});

const replacePrinted = useParam('replacePrinted', {
    type:    'boolean',
    bind:    'query',
    name:    'rp',
    default: false,
});

const replaceFrom = useParam('replaceFrom', {
    type:    'string',
    bind:    'query',
    name:    'rf',
    default: '',
});

const replaceTo = useParam('replaceTo', {
    type:    'string',
    bind:    'query',
    name:    'rt',
    default: '',
});

const clearDevOracle = useParam('clearDevOracle', {
    type:    'boolean',
    bind:    'query',
    name:    'co',
    default: false,
});

const clearDevPrinted = useParam('clearDevPrinted', {
    type:    'boolean',
    bind:    'query',
    name:    'cp',
    default: false,
});

const clearDevUnified = useParam('clearDevUnified', {
    type:    'boolean',
    bind:    'query',
    name:    'cu',
    default: false,
});

const showBeforeOracle = useParam('showBeforeOracle', {
    type:    'boolean',
    bind:    'query',
    name:    'bo',
    default: false,
});

const search = computed({
    get() { return route.query.q as string ?? ''; },
    set(newValue: string) {
        void router.replace({
            query: {
                ...route.query,
                q: newValue,
            },
        });
    },
});

type CardPart = CardEditorView['cardPart'];
type Print = CardEditorView['print'];
type PrintPart = CardEditorView['printPart'];

const card = computed(() => data.value?.card);
const cardLocalization = computed(() => data.value?.cardLocalization);
const cardPart = computed(() => data.value?.cardPart);
const cardPartLocalization = computed(() => data.value?.cardPartLocalization);
const print = computed(() => data.value?.print);
const printPart = computed(() => data.value?.printPart);

const inDatabase = computed(() => data.value?.__inDatabase ?? false);

const id = computed({
    get() { return data.value?.cardId ?? route.query.id as string; },
    set(newValue: string) {
        if (data.value != null) {
            data.value.__original.cardId = data.value.cardId;
            data.value.cardId = newValue;
        }
    },
});

const locale = computed({
    get() { return data.value?.locale ?? route.query.locale as Locale ?? game.locale; },
    set(newValue) {
        if (data.value != null) {
            data.value.__original.locale = data.value.locale;
            data.value.locale = newValue;
        }

        void router.replace({ query: { ...route.query, locale: newValue } });
    },
});

const lang = computed({
    get() { return (data.value?.lang ?? route.query.lang) as Locale; },
    set(newValue) {
        if (data.value != null) {
            data.value.__original.lang = data.value.lang;
            data.value.lang = newValue;
        }
    },
});

const set = computed(() => data.value?.set ?? route.query.set as string);
const number = computed(() => data.value?.number ?? route.query.number as string);

const partIndex = computed({
    get() {
        if (data.value?.partIndex != null) {
            return data.value.partIndex;
        }

        if (route.query.part != null) {
            const result = parseInt(route.query.part as string, 10);

            if (!Number.isNaN(result)) {
                return result;
            }
        }

        return 0;
    },
    async set(newValue: number) {
        await doUpdate();

        router.replace({
            query: {
                ...route.query,
                part: newValue,
            },
        });

        loadData(newValue);
    },
});

const info = computed(() => {
    if (data.value != null) {
        return `${locale.value}/${lang.value}, ${set.value}:${number.value}`;
    } else {
        return '';
    }
});

const cardLink = computed(() => ({
    name:   'magic/card',
    params: { id: id.value },
    query:  {
        locale: locale.value,
        set:    set.value,
        number: number.value,
    },
}));

const partCount = computed(() => data.value?.card.partCount ?? 0);

const loaded = computed(() => dataGroup.value?.result.length);
const total = computed(() => dataGroup.value?.total);

const layout = computed({
    get() { return data.value?.print.layout ?? 'normal'; },
    set(newValue: Layout) {
        if (data.value != null) {
            data.value.print.layout = newValue;
        }
    },
});

const layoutOptions = ['normal', 'split', 'multipart', 'battle', 'reversible_card', 'transform_token'];

const partOptions = computed(() => {
    const result = [];

    for (let i = 0; i < partCount.value; i += 1) {
        result.push({ value: i, label: i.toString() });
    }

    return result;
});

type WithLockedPaths = {
    __lockedPaths: string[];
};

const lockPath = <T extends WithLockedPaths>(value: ComputedRef<T | undefined>, path: string) => {
    if (value.value != null && !(value.value.__lockedPaths ?? []).includes(path)) {
        value.value.__lockedPaths ??= [];

        value.value.__lockedPaths.push(path);
    }
};

const cardPartField = <F extends keyof CardPart>(firstKey: F, defaultValue?: CardPart[F], path?: string | (() => string)) => computed({
    get() { return (cardPart.value?.[firstKey] ?? defaultValue)!; },
    set(newValue: CardPart[F]) {
        if (data.value != null && !isEqual(cardPart.value![firstKey], newValue)) {
            cardPart.value![firstKey] = newValue;

            if (path != null) {
                const realPath = typeof path === 'string' ? path : path();

                lockPath(card, realPath);
            }
        }
    },
});

const printField = <F extends keyof Print>(firstKey: F, defaultValue?: Print[F], path?: string | (() => string)) => computed({
    get() { return (print.value?.[firstKey] ?? defaultValue)!; },
    set(newValue: Print[F]) {
        if (data.value != null && !isEqual(print.value![firstKey], newValue)) {
            print.value![firstKey] = newValue;

            if (path != null) {
                const realPath = typeof path === 'string' ? path : path();

                lockPath(print, realPath);
            }
        }
    },
});

const printPartField = <F extends keyof PrintPart>(firstKey: F, defaultValue?: PrintPart[F], path?: string | (() => string) | null) => computed({
    get() { return (printPart.value?.[firstKey] ?? defaultValue)!; },
    set(newValue: PrintPart[F]) {
        if (data.value != null && !isEqual(printPart.value![firstKey], newValue)) {
            printPart.value![firstKey] = newValue;

            if (path !== null) {
                const realPath = path == null ? firstKey : typeof path === 'string' ? path : path();

                lockPath(printPart, realPath);
            }
        }
    },
});

const oracleName = cardPartField('name', '');
const oracleTypeline = cardPartField('typeline', '');
const oracleText = cardPartField('text', '');

const oracleUpdated = computed(() => cardPart.value?.__updations.some(u => u.key === 'text') ?? false);

const displayOracleText = computed({
    get() {
        if (oracleUpdated.value && showBeforeOracle.value) {
            return cardPart.value?.__updations.find(u => u.key === 'text')!.oldValue;
        } else {
            return oracleText.value;
        }
    },
    set(newValue) {
        if (oracleUpdated.value && showBeforeOracle.value) {
            return;
        }

        oracleText.value = newValue;
    },
});

const printedName = printPartField('name', '', 'name');
const printedTypeline = printPartField('typeline', '', 'typeline');
const printedText = printPartField('text', '', 'text');

const unifiedName = computed({
    get() {
        return cardPartLocalization.value?.name ?? '';
    },
    set(newValue) {
        if (cardPartLocalization.value == null || cardPartLocalization.value.name === newValue) {
            return;
        }

        cardPartLocalization.value.name = newValue;

        cardLocalization.value!.name = cardLocalization.value!.name
            .split('//')
            .map((v, i) => i === partIndex.value ? newValue.trim() : v.trim())
            .join(' // ');

        lockPath(cardPartLocalization, 'name');
    },
});

const unifiedTypeline = computed({
    get() {
        return cardPartLocalization.value?.typeline ?? '';
    },
    set(newValue) {
        if (cardPartLocalization.value == null || cardPartLocalization.value.typeline === newValue) {
            return;
        }

        cardPartLocalization.value.typeline = newValue;

        cardLocalization.value!.typeline = cardLocalization.value!.typeline
            .split('//')
            .map((v, i) => i === partIndex.value ? newValue.trim() : v.trim())
            .join(' // ');

        lockPath(cardPartLocalization, 'typeline');
    },
});

const unifiedText = computed({
    get() {
        return cardPartLocalization.value?.text ?? '';
    },
    set(newValue) {
        if (cardPartLocalization.value == null || cardPartLocalization.value.text === newValue) {
            return;
        }

        cardPartLocalization.value.text = newValue;

        cardLocalization.value!.text = cardLocalization.value!.text
            .split('////////////////////')
            .map((v, i) => i === partIndex.value ? newValue.trim() : v.trim())
            .join('\n////////////////////\n');

        lockPath(cardPartLocalization, 'text');
    },
});

const flavorTextInner = printPartField('flavorText', '');

const flavorText = computed({
    get() { return flavorTextInner.value ?? ''; },
    set(newValue) {
        if (newValue === '') {
            flavorTextInner.value = null;
        } else {
            flavorTextInner.value = newValue;
        }
    },
});

const flavorName = printPartField('flavorName', '');

const releaseDate = computed(() => print.value?.releaseDate);

const imageStatusOptions = ['highres_scan', 'lowres', 'placeholder', 'missing'];
const fullImageTypeOptions = ['jpg', 'webp'];

const imageStatus = printField('imageStatus', 'placeholder');
const fullImageType = printField('fullImageType', 'jpg');

// dev only
const cardTag = (name: string) => computed({
    get(): boolean {
        if (card.value == null) {
            return false;
        }

        return card.value.tags.includes(`dev:${name}`);
    },
    set(newValue: boolean) {
        if (card.value == null) {
            return;
        }

        if (newValue) {
            if (!card.value.tags.includes(`dev:${name}`)) {
                card.value.tags.push(`dev:${name}`);
            }
        } else {
            card.value.tags = card.value.tags.filter(v => v !== `dev:${name}`);
        }
    },
});

const printTag = (name: string) => computed({
    get(): boolean {
        if (print.value == null) {
            return false;
        }

        return print.value.printTags.includes(`dev:${name}`);
    },
    set(newValue: boolean) {
        if (print.value == null) {
            return;
        }

        if (newValue) {
            if (!print.value.printTags.includes(`dev:${name}`)) {
                print.value.printTags.push(`dev:${name}`);
            }
        } else {
            print.value.printTags = print.value.printTags.filter(v => v !== `dev:${name}`);
        }
    },
});

const devPrinted = printTag('printed');
const devUnified = cardTag('unified');
const devOracle = cardTag('oracle');
const devToken = cardTag('token');
const devCounter = cardTag('counter');

const devOracleColor = computed(() => {
    if (clearDevOracle.value) {
        if (devOracle.value) {
            return 'purple';
        } else {
            return 'primary';
        }
    } else {
        if (devOracle.value) {
            return 'red';
        } else {
            return 'grey';
        }
    }
});

const devPrintedColor = computed(() => {
    if (clearDevPrinted.value) {
        if (devPrinted.value) {
            return 'purple';
        } else {
            return 'primary';
        }
    } else {
        if (devPrinted.value) {
            return 'red';
        } else {
            return 'grey';
        }
    }
});

const devUnifiedColor = computed(() => {
    if (clearDevUnified.value) {
        if (devUnified.value) {
            return 'purple';
        } else {
            return 'primary';
        }
    } else {
        if (devUnified.value) {
            return 'red';
        } else {
            return 'grey';
        }
    }
});

const clickDevOracle = () => {
    if (clearDevOracle.value) {
        clearDevOracle.value = false;
        return;
    }

    if (devOracle.value) {
        devOracle.value = false;
        return;
    }

    clearDevOracle.value = true;
};

const clickDevPrinted = () => {
    if (clearDevPrinted.value) {
        clearDevPrinted.value = false;
        return;
    }

    if (devPrinted.value) {
        devPrinted.value = false;
        return;
    }

    clearDevPrinted.value = true;
};

const clickDevUnified = () => {
    if (clearDevUnified.value) {
        clearDevUnified.value = false;
        return;
    }

    if (devUnified.value) {
        devUnified.value = false;
        return;
    }

    clearDevUnified.value = true;
};

const relatedCards = computed({
    get() {
        return data.value?.relatedCards ?? [];
    },
    set(newValue) {
        if (data.value == null) {
            return;
        }

        data.value.relatedCards = newValue;
        devToken.value = false;
    },
});

const relatedCardsString = computed({
    get() {
        return relatedCards.value
            ?.map(
                ({ relation, cardId, version }) => (version != null
                    ? [relation, cardId, version.lang, version.set, version.number]
                    : [relation, cardId]
                ).join('|'),
            )
            ?.join('; ') ?? '';
    },
    set(newValue: string) {
        if (data.value == null) {
            return;
        }

        if (newValue === '') {
            relatedCards.value = [];
            devToken.value = false;
            return;
        }

        const parts = newValue.split(/; */);

        relatedCards.value = parts.map(p => {
            let [relation, cardId, langInput, set, number] = p.split('|');

            const lang = langInput == null ? undefined : localeEnum.safeParse(langInput).data ?? localeEnum.options[0];

            if (relation.length === 1) {
                relation = {
                    t: 'token',
                    e: 'emblem',
                    i: 'intext',
                    m: 'meld',
                    s: 'specialization',
                }[relation] ?? relation;
            }

            if (relation === 'emblem' && cardId == null) {
                cardId = `${id.value}_emblem`;
            }

            cardId = deburr(cardId)
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9!*+]/g, '_');

            if (lang != null) {
                return { relation, cardId, version: { locale: lang, lang, set, number } };
            } else {
                return { relation, cardId };
            }
        });

        devToken.value = false;
    },
});

const counters = computed({
    get() { return card.value?.counters ?? []; },
    set(newValue) {
        if (card.value == null) {
            return;
        }

        newValue = uniq(newValue).sort();

        devCounter.value = false;

        card.value.counters = newValue.sort();
    },
});

const multiverseId = printField('multiverseId', [], 'multiverseId');

const lockedPaths = computed(() => ({
    card:                 card.value?.__lockedPaths ?? [],
    cardLocalization:     cardLocalization.value?.__lockedPaths ?? [],
    cardPart:             cardPart.value?.__lockedPaths ?? [],
    cardPartLocalization: cardPartLocalization.value?.__lockedPaths ?? [],
    print:                print.value?.__lockedPaths ?? [],
    printPart:            printPart.value?.__lockedPaths ?? [],
}));

const defaultTypelinePrettifier = (typeline: string, lang: string) => {
    typeline = typeline
        .replace(/\s/g, ' ')
        .replace(/ *～ *-? */, '～')
        .replace(/ *(--|[―—–]) *-? */, ' — ')
        .replace(/ *: *-? */, ' : ');

    if (lang === 'zhs' || lang === 'zht') {
        typeline = typeline.replace(/~/g, '～').replace(/\//g, '／');
    } else {
        typeline = typeline.replace(/ - /g, ' — ');

        if (lang == 'ja') {
            typeline = typeline.replace(/·/g, '・');
        }
    }

    return typeline.trim();
};

const defaultTextPrettifier = (text: string, lang: string, name: string) => {
    text = text.replace(/~~~/g, name);

    if (lang === 'zhs' || lang === 'zht') {
        text = text.replace(/~/g, '～').replace(/\/\//g, '／').trim();
    }

    text = text
        .trim()
        .replace(/[^\S\n]+$|^[^\S\n]+/mg, '')
        .replace(/\n{2,}/g, '\n')
        .replace(/^[●•‧・] ?/mg, lang === 'ja' ? '・' : '• ')
        .replace(/<\/?.>/g, '')
        .replace(/&lt;\/?.&gt;/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&.*?;/g, '');

    if (lang === 'zhs' || lang === 'zht') {
        if (!/[a-wyz](?![/}])/.test(text)) {
            text = text
                .replace(/^\[[A-Z]+\].*$/mg, text => text.replace(/ /g, '<placeholder>'))
                .replace(/(?<!•)(?<!\d-\d)(?<!\d\+)(?<!—)(?<!^\[[A-Z]+\].*) (?!—|II|IV|V)/g, '')
                .replace(/\(/g, '（')
                .replace(/\)/g, '）')
                .replace(/;/g, '；')
                .replace(/<placeholder>/g, ' ');
        }
    }

    if (lang === 'en') {
        text = text
            .replace(/[‘’]/g, '\'');
    }

    if (lang === 'de') {
        text = text
            .replace(/"/g, '“')
            .replace(/'/g, '‘');
    }

    if (lang === 'fr') {
        text = text
            .replace(/<</g, '«')
            .replace(/>>/g, '»');
    }

    if (lang == 'ja') {
        text = text.replace(/·/g, '・');
    }

    return text;
};

const defaultPrettify = () => {
    if (data.value == null) {
        return;
    }

    cardPartLocalization.value!.typeline = defaultTypelinePrettifier(cardPartLocalization.value!.typeline, lang.value);
    cardPartLocalization.value!.text = defaultTextPrettifier(cardPartLocalization.value!.text, lang.value, cardPartLocalization.value!.name);

    printPart.value!.typeline = defaultTypelinePrettifier(printPart.value!.typeline, lang.value);
    printPart.value!.text = defaultTextPrettifier(printPart.value!.text, lang.value, printPart.value!.flavorName ?? printPart.value!.name);

    if (flavorText.value != null && flavorText.value !== '') {
        flavorText.value = flavorText.value
            .trim()
            .replace(/[^\S\n]+$|^[^\S\n]+/mg, '');

        if (lang.value === 'zhs' || lang.value === 'zht') {
            flavorText.value = flavorText.value
                .replace(/~/g, '～')
                .replace(/\.\.\./g, '…')
                .replace(/」 ?～/g, '」\n～')
                .replace(/。 ?～/g, '。\n～')
                .replace(/([，。！？：；]) /g, (m: any, m1: string) => m1);
        }

        if (lang.value === 'de') {
            flavorText.value = flavorText.value
                .replace(/"/g, '“')
                .replace(/'/g, '‘');
        }

        if (lang.value === 'fr') {
            flavorText.value = flavorText.value
                .replace(/<</g, '«')
                .replace(/>>/g, '»');
        }
    }

    if (clearDevOracle.value) {
        devOracle.value = false;
    }

    if (clearDevPrinted.value) {
        devPrinted.value = false;
    }

    if (clearDevUnified.value) {
        devUnified.value = false;
    }
};

const prettify = () => {
    if (data.value == null) {
        return;
    }

    if (lang.value !== 'en') {
        if (oracleName.value !== unifiedName.value) {
            if (oracleName.value === printedName.value || printedName.value === '') {
                printedName.value = unifiedName.value;
            }
        }

        if (oracleName.value !== printedName.value) {
            if (oracleName.value === unifiedName.value || unifiedName.value === '') {
                unifiedName.value = printedName.value;
            }
        }

        if (oracleTypeline.value !== unifiedTypeline.value) {
            if (oracleTypeline.value === printedTypeline.value || printedTypeline.value === '') {
                printedTypeline.value = unifiedTypeline.value;
            }
        }

        if (oracleTypeline.value !== printedTypeline.value) {
            if (oracleTypeline.value === unifiedTypeline.value || unifiedTypeline.value === '') {
                unifiedTypeline.value = printedTypeline.value;
            }
        }

        if (oracleText.value !== unifiedText.value) {
            if (oracleText.value === printedText.value || printedText.value === '') {
                printedText.value = unifiedText.value;
            }
        }

        if (oracleText.value !== printedText.value) {
            if (oracleText.value === unifiedText.value || unifiedText.value === '') {
                unifiedText.value = printedText.value;
            }
        }
    }

    if (/^\((Theme color: (\{.\})+|\{T\}: Add \{.\}\.)\)$/.test(printedText.value!)) {
        printedText.value = '';
    }

    if (lang.value === 'ja') {
        unifiedName.value = unifiedName.value!.replace(/（.*?）/g, '');
        printedName.value = printedName.value!.replace(/（.*?）/g, '');
        unifiedText.value = unifiedText.value!.replace(/ *<i>[(（][^)）]+[)）]<\/i> */g, '').trim();

        const applyReplace = (v: string) => {
            const charMap: Record<string, string> = {
                '0': '０',
                '1': '１',
                '2': '２',
                '3': '３',
                '4': '４',
                '5': '５',
                '6': '６',
                '7': '７',
                '8': '８',
                '9': '９',
                'X': 'Ｘ',
                '+': '＋',
                '-': '－',
                '(': '（',
                ')': '）',
            };

            const replacer = (nums: string) => (/\d{2}/.test(nums) ? nums : nums.split('').map(c => charMap[c] ?? c).join(''));

            return v
                .replace(/(?<!K-?|ED|Vault |d\d+|\/)[-+0-9X()]+(?!\d*[}/]|.* \| )/g, replacer)
                .replace(/^\[[A-Z]+\] .*$/gm, text => {
                    return text.replace(/[０-９Ｘ＋－]/g, t => {
                        return Object.keys(charMap)[Object.values(charMap).indexOf(t)];
                    });
                });
        };

        unifiedText.value = applyReplace(unifiedText.value!);
        printedText.value = applyReplace(printedText.value!);
    }

    if (lang.value === 'zhs' || lang.value === 'zht') {
        unifiedTypeline.value = unifiedTypeline.value.replace(/ — /g, '～').replace(/\//g, '／');
        printedTypeline.value = printedTypeline.value.replace(/ — /g, '～').replace(/\//g, '／');
    } else if (lang.value === 'fr') {
        unifiedTypeline.value = unifiedTypeline.value.replace(/ — /g, ' : ').trim();
        printedTypeline.value = printedTypeline.value.replace(/ — /g, ' : ').trim();
    } else if (lang.value !== 'ja') {
        unifiedTypeline.value = unifiedTypeline.value.replace(/ - /g, ' — ').trim();
        printedTypeline.value = printedTypeline.value.replace(/ - /g, ' — ').trim();
    }

    defaultPrettify();

    if (replaceFrom.value !== '') {
        const fromTypelineRegex = new RegExp(replaceFrom.value, 'ugm');
        const toReplacer = (text: string, ...captures: string[]) => replaceTo.value
            .replace(/\\n/g, '\n')
            .replace(/\$(\d)/g, (_, num) => captures[Number.parseInt(num, 10) - 1]);

        if (replaceUnified.value) {
            const fromRegex = new RegExp(replaceFrom.value.replace(/~~~/g, escapeRegExp(unifiedName.value)), 'ugm');

            unifiedText.value = unifiedText.value!.replace(fromRegex, toReplacer);
            unifiedTypeline.value = unifiedTypeline.value.replace(fromTypelineRegex, toReplacer);
        }

        if (replacePrinted.value) {
            const fromRegex = new RegExp(replaceFrom.value.replace(/~~~/g, escapeRegExp(flavorName.value ?? printedName.value)), 'ugm');

            printedText.value = printedText.value!.replace(fromRegex, toReplacer);
            printedTypeline.value = printedTypeline.value.replace(fromTypelineRegex, toReplacer);
        }
    }

    defaultPrettify();

    if (!withParen.includes(id.value)) {
        unifiedText.value = unifiedText.value!
            .replace(new RegExp(parenRegex.source, 'g'), '').trim();
    }

    if (separateKeyword.value && !withComma.includes(id.value)) {
        unifiedText.value = unifiedText.value.replace(
            new RegExp(commaRegex.source, 'mg'),
            l => l.split(/[,，、;；] */g).map(v => upperFirst(v)).join('\n'),
        );
    }

    const applyReplace = (v: string) => {
        const numberMap: Record<string, string> = {
            '０': '0',
            '１': '1',
            '２': '2',
            '３': '3',
            '４': '4',
            '５': '5',
            '６': '6',
            '７': '7',
            '８': '8',
            '９': '9',
            'Ｘ': 'X',
        };

        const symbolMap: Record<string, string> = {
            '-': '-',
            '—': '-',
            '―': '-',
            '－': '-',
            '–': '-',
            '−': '-',

            '＋': '+',
            '+': '+',
        };

        const replacer = (_: string, sym: string, num: string) => `[${symbolMap[sym]}${num.split('').map(n => numberMap[n] ?? n).join('')}]`;

        return v
            .replace(/^([-—―－–−＋+])([0-9X０-９Ｘ]+)(?!\/)/mg, replacer)
            .replace(/\[([-—―－–−＋+])([0-9X０-９Ｘ]+)\]/mg, replacer)
            .replace(/^[0０](?=[:：]| :)/mg, '[0]')
            .replace(/\[０\]/mg, '[0]');
    };

    oracleText.value = applyReplace(oracleText.value!);
    unifiedText.value = applyReplace(unifiedText.value);

    if (printedTypeline.value !== 'Planeswalker Legend' && !['cmb1', 'cmb2'].includes(set.value)) {
        printedText.value = applyReplace(printedText.value!);
    }

    if (flavorText.value != null) {
        if (['zhs', 'zht', 'ja'].includes(lang.value)) {
            flavorText.value = flavorText.value
                .replace(/<\/?.>/g, '');
        } else {
            flavorText.value = flavorText.value
                .replace(/<\/?.>/g, '*');
        }
    }
};

const oracleOverwriteUnified = () => {
    if (lang.value !== 'en') {
        return;
    }

    unifiedName.value = oracleName.value;
    unifiedTypeline.value = oracleTypeline.value;
    unifiedText.value = oracleText.value;
};

const printedOverwriteUnified = () => {
    unifiedName.value = printedName.value;
    unifiedTypeline.value = printedTypeline.value;
    unifiedText.value = printedText.value;
};

const getLegality = async () => {
    const result = await trpc.magic.card.getLegality(id.value);

    console.log(result);

    if (card.value != null) {
        card.value.legalities = mapValues(result, v => v.result);
    }
};

const extractRulingCards = async () => {
    const cards = await trpc.magic.card.extractRulingCards(id.value);

    console.log(cards);
};

type ScanResult = {
    name:       string;
    typeline:   string;
    text:       string;
    flavorText: string;
};

const scanCardText = async () => {
    if (data.value == null) {
        return;
    }

    return await trpc.magic.card.scanCardText({
        set:       set.value,
        number:    number.value,
        lang:      lang.value,
        layout:    layout.value,
        partIndex: partIndex.value,
    });
};

const applyScanFlavorText = (result: ScanResult) => {
    if (flavorText.value == '') {
        flavorText.value = result.flavorText;
    } else if (flavorText.value != result.flavorText) {
        flavorText.value ??= '';

        flavorText.value += '\n\n' + result.flavorText;
    }
};

const applyScanCardText = (result: ScanResult) => {
    printedName.value = result.name;
    printedTypeline.value = result.typeline;
    printedText.value = result.text;

    applyScanFlavorText(result);
};

const reloadCardImage = async () => {
    if (data.value == null) {
        return;
    }

    await trpc.magic.data.scryfall.reloadImage({
        cardId: id.value,
        set:    set.value,
        number: number.value,
        lang:   lang.value,
    });
};

const applyReloadCardImage = () => {
    print.value!.fullImageType = 'jpg';

    refreshToken.value = crypto.randomUUID();
};

const newData = () => {
    if (data.value == null) {
        return;
    }

    data.value.__inDatabase = false;

    data.value.printPart.scryfallIllusId = null;

    data.value.print.scryfallCardId = null;
    data.value.print.scryfallImageUris = [];
    data.value.print.arenaId = null;
    data.value.print.mtgoId = null;
    data.value.print.mtgoFoilId = null;
    data.value.print.multiverseId = [];
    data.value.print.tcgPlayerId = null;
    data.value.print.cardMarketId = null;

    unlock.value = true;
};

const checkPaths = [
    'cardId', 'lang', 'card.layout', 'print.imageStatus',
    'cardPart.name', 'cardPart.typeline', 'cardPart.text',
    'cardPartLocalization.name', 'cardPartLocalization.typeline', 'cardPartLocalization.text',
    'printPart.name', 'printPart.typeline', 'printPart.text', 'printPart.flavorText', 'printPart.flavorName',
    'print.multiverseId',
];

const isFieldModified = (path: string): boolean => {
    if (!data.value || !originalData.value) {
        return false;
    }

    const currentValue = at(data.value, path);
    const originalValue = at(originalData.value, path);

    return !isEqual(currentValue, originalValue);
};

const fieldClasses = computed(() => {
    if (!data.value || !originalData.value) {
        return {};
    }

    if (data.value.cardId !== originalData.value.cardId
      || data.value.lang !== originalData.value.lang
      || data.value.set !== originalData.value.set
      || data.value.number !== originalData.value.number
    ) {
        return {};
    }

    return Object.fromEntries(
        checkPaths.map(path => [path, isFieldModified(path) ? 'field-modified' : '']),
    );
});

const getAllModifiedFields = (): string[] => {
    if (!data.value || !originalData.value) {
        return [];
    }

    if (data.value.cardId !== originalData.value.cardId
      || data.value.lang !== originalData.value.lang
      || data.value.set !== originalData.value.set
      || data.value.number !== originalData.value.number
    ) {
        return [];
    }

    return checkPaths.filter(path => isFieldModified(path));
};

const hasModifications = computed(() => getAllModifiedFields().length > 0);

const modifiedFieldsCount = computed(() => getAllModifiedFields().length);

const resetComparison = () => {
    if (data.value) {
        originalData.value = cloneDeep(data.value);
    }
};

const doUpdate = debounce(
    async () => {
        if (data.value == null) {
            return;
        }

        if (forcePrettify.value) {
            prettify();
        } else {
            defaultPrettify();
        }

        await nextTick();

        history.value.unshift({
            id:     id.value,
            locale: locale.value,
            set:    set.value,
            number: number.value,
            lang:   lang.value,
        });

        await trpc.magic.card.update(data.value);
    },
    200,
    {
        leading:  true,
        trailing: false,
    },
);

const loadData = async (newPartIndex?: number) => {
    if (id.value == null || locale.value == null || lang.value == null || set.value == null || number.value == null || (newPartIndex ?? partIndex.value) == null) {
        return;
    }

    // Reset all remote button states
    remoteBtns.value.forEach(btn => btn?.reset());

    const view = await trpc.magic.card.editorView({
        cardId:    id.value,
        locale:    locale.value,
        lang:      lang.value,
        set:       set.value,
        number:    number.value,
        partIndex: newPartIndex ?? partIndex.value,
    });

    [data.value, originalData.value] = [view, cloneDeep(view)];
};

watch(
    [id, lang, set, number, partIndex],
    async ([newId, newLang, newSet, newNumber, newPartIndex], [oldId, oldLang, oldSet, oldNumber, oldPartIndex]) => {
        if (
            newId !== oldId
            || newLang !== oldLang
            || newSet !== oldSet
            || newNumber !== oldNumber
            || newPartIndex !== oldPartIndex
        ) {
            await loadData();
        }
    },
    { immediate: true },
);

const loadGroup = async (method: string, skip = false) => {
    if (data.value != null && !skip) {
        await doUpdate();

        await (async (time: number) => new Promise(resolve => { setTimeout(resolve, time); }))(100);
    }

    if (dataGroup.value != null && dataGroup.value.method === method && dataGroup.value.result.length > 0) {
        data.value = dataGroup.value.result.shift();
        dataGroup.value.total -= 1;
        return;
    }

    const sampleValue = sample.value ? 50 : 1;

    const result: CardGroup = await (async () => {
        if (method.startsWith('search:')) {
            const search = await trpc.magic.search.dev({
                q:        method.slice(7),
                pageSize: sampleValue,
                groupBy:  groupBy.value as any,
            });

            if (search.result != null) {
                return {
                    method: search.method,
                    ...search.result,
                };
            } else {
                throw new Error('Search failed');
            }
        } else {
            return await trpc.magic.card.needEdit({
                method: method as any,
                lang:   selectedLocale.value === '' ? undefined : selectedLocale.value as Locale,
                sample: sampleValue,
            });
        }
    })();

    if (result != null && result.total !== 0) {
        dataGroup.value = result;
        data.value = dataGroup.value.result.shift();
    } else {
        dataGroup.value = undefined;
        data.value = undefined;
    }
};

watch([sample, selectedLocale, groupBy], () => { dataGroup.value = undefined; });

const doSearch = async () => {
    if (search.value === '') {
        return;
    }

    loadGroup(`search:${search.value}`);
};

const skipCurrent = async () => {
    if (dataGroup.value == null) {
        return;
    }

    loadGroup(dataGroup.value.method, true);
};

watch(
    [data, partIndex, printedName, printedTypeline, printedText],
    ([newValue, newIndex], [oldValue, oldIndex]) => {
        if (newValue === oldValue && newIndex === oldIndex) {
            devPrinted.value = false;
        }
    },
);

watch(
    [data, partIndex, unifiedName, unifiedTypeline, unifiedText],
    ([newValue, newIndex], [oldValue, oldIndex]) => {
        if (newValue === oldValue && newIndex === oldIndex) {
            devUnified.value = false;
        }
    },
);

const guessToken = () => {
    if (data.value == null) {
        return;
    }

    const relatedCardsValue = [...relatedCards.value];

    const text = oracleText.value;

    for (const m of text.matchAll(guessRegex)) {
        let tokenId = '';

        const mp = predefinedCheckRegex.exec(m[0]);

        if (mp != null) {
            if (mp[1] === 'colorless Clue artifact') {
                tokenId = 'clue!';
            } else {
                tokenId = `${mp[1].toLowerCase()}!`;
            }
        } else if (m[0].includes(' Role ')) {
            tokenId = `${m[6].toLowerCase().replaceAll(/[ -]/g, '_')}!`;
        } else {
            tokenId += m[3].toLowerCase().replaceAll(/[ -]/g, '_');
            tokenId += `!${colorMap[m[2]]}`;

            if (m[1] == null) {
                tokenId += '!**';
            } else {
                tokenId += `!${m[1].split('/').map(v => (v === 'X' ? '*' : v)).join('')}`;
            }

            if (m[4] != null) {
                tokenId += `!${
                    m[4].split('and')
                        .map(a => keywordMap[a.trim()] ?? 'a')
                        .join('')
                }`;
            }

            if (tokenId === 'eldrazi_scion!c!11' || tokenId === 'eldrazi_spawn!c!01') {
                tokenId += '!a';
            }
        }

        if (relatedCards.value.every(r => r.cardId !== tokenId)) {
            relatedCardsValue.push({ relation: 'token', cardId: tokenId });
        }
    }

    if (/^(Embalm|Eternalize|Squad|Offspring)/m.test(text)) {
        relatedCardsValue.push({ relation: 'token', cardId: `${id.value}!` });
    }

    if (/\bincubates?\b/i.test(text)) {
        relatedCardsValue.push({ relation: 'token', cardId: 'incubator!' });
    }

    relatedCards.value = relatedCardsValue;
};

const guessCounter = () => {
    if (data.value == null) {
        return;
    }

    const text = oracleText.value;

    const matches = text.matchAll(/(\b(?:first|double) strike|\b[a-z!]+|[+-]\d\/[+-]\d) counters?\b/g);

    counters.value = [
        ...counters.value,
        ...[...matches]
            .map(m => m[1])
            .map(c => (/^[+-]\d\/[+-]\d$/.test(c)
                ? c
                : c.toLowerCase().replace(/[^a-z0-9]/g, '_')))
            .filter(c => !counterBlacklist.includes(c)),
    ];
};

const refreshToken = ref('');

type ParseGatherer = {
    name:        string;
    typeline:    string;
    text:        string;
    flavorText?: string;
};

const currentMultiverseId = computed(() => print.value?.multiverseId[partIndex.value] ?? undefined);

const parseGatherer = async (mid: number) => {
    return await trpc.magic.data.gatherer.parseCard(mid);
};

const parseGathererDefault = async () => {
    const multiverseId = currentMultiverseId.value;

    if (multiverseId == null) {
        return;
    }

    return parseGatherer(multiverseId);
};

const applyParseGatherer = (value: ParseGatherer | undefined) => {
    if (value == null) {
        return;
    }

    printedName.value = value.name;
    printedText.value = value.text;
    flavorText.value = value.flavorText ?? '';
};

type MtgchCard = {
    name:        string;
    typeline:    string;
    text:        string;
    flavorText?: string;
};

const getMtgch = async () => {
    if (data.value == null) {
        return;
    }

    return await trpc.magic.data.mtgch.getCard({
        set:    set.value,
        number: number.value,
    });
};

const applyMtgchFlavor = (value: MtgchCard | undefined) => {
    if (value == null) {
        return;
    }

    flavorText.value = value.flavorText ?? '';
};

const applyMtgch = (value: MtgchCard | undefined) => {
    if (value == null) {
        return;
    }

    printedName.value = value.name;
    printedTypeline.value = value.typeline;
    printedText.value = value.text;
    flavorText.value = value.flavorText ?? '';
};

const promoWithoutBaseSet = [
    'pmei', 'parl', 'psus', 'p2hg', 'plst',
    'pidw', 'past', 'pdci', 'ppro', 'pcel',
    'pgpx', 'pwcq', 'pxtc', 'pagl', 'ph20',
];

const getOriginalInfo = (set: string, number: string) => {
    if (set === 'plst' && number.split('-').length === 2) {
        const [newSet, newNumber] = number.split('-');

        return { set: newSet.toLowerCase(), number: newNumber };
    }

    if (set.length === 4 && set.startsWith('p') && !promoWithoutBaseSet.includes(set)) {
        return { set: set.slice(1), number: number.replace(/[aps★]$/, '') };
    }

    if (['cei', 'ced'].includes(set)) {
        return { set: 'leb', number };
    }

    if (number.endsWith('★') || number.endsWith('†')) {
        return { set, number: number.replace(/★$/, '') };
    }
};

const cloningTextEnabled = computed(() => {
    if (data.value == null) {
        return false;
    }

    const { set, number } = data.value;

    return getOriginalInfo(set, number) != null;
});

type ParsePlst = {
    name:      string;
    typeline?: string;
    text:      string;
};

const getCloningSourceText = async () => {
    if (data.value == null) {
        return undefined;
    }

    const info = getOriginalInfo(data.value.set, data.value.number);

    if (info == null) {
        return undefined;
    }

    const { set, number } = info;

    const origData = await trpc.magic.card.editorView({
        cardId:    id.value,
        locale:    'en',
        lang:      'en',
        set,
        number,
        partIndex: partIndex.value,
    });

    if (!origData.print.printTags.includes('dev:printed')) {
        return {
            name:     origData.printPart.name,
            typeline: origData.printPart.typeline,
            text:     origData.printPart.text,
        };
    }

    const mid = origData.print.multiverseId[partIndex.value];

    if (mid == null) {
        return undefined;
    }

    const gathererResult = await parseGatherer(mid);

    return {
        name: gathererResult.name,
        text: gathererResult.text,
    };
};

const applyCloningSourceText = (result: ParsePlst | undefined) => {
    if (result == null) {
        return;
    }

    printedName.value = result.name;

    if (result.typeline != null) {
        printedTypeline.value = result.typeline;
    }

    printedText.value = result.text;
};

const saveGathererImage = async () => {
    if (data.value == null) {
        return;
    }

    await trpc.magic.data.gatherer.saveImage({
        mids:   multiverseId.value,
        set:    set.value,
        number: number.value,
        lang:   lang.value,
    });
};

const applySaveGathererImage = () => {
    print.value!.fullImageType = 'webp';

    refreshToken.value = crypto.randomUUID();
};

</script>

<style lang="sass" scoped>

.search > :deep(.q-field__inner > .q-field__control)
    padding-left: 0

.inline-flex
    display: inline-flex

.card-not-found
    width: 100%
    background-color: transparent !important
    padding: 0 !important

.q-input.id
    width: 300px

table
    width: 100%

    & .text:deep(textarea)
        height: 200px

@media screen and (max-width: 1000px)
    .card-image
        display: none

.field-modified :deep(.q-field__control)
    border-color: #4caf50 !important
    box-shadow: 0 0 0 2px #4caf50 !important

.field-modified :deep(.q-chip)
    border: 1px solid #4caf50 !important

</style>
