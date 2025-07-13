<template>
    <div class="q-pa-md row">
        <div class="card-image col-3 q-mr-md">
            <card-image
                v-if="data != null"
                :lang="lang"
                :set="set"
                :number="number"
                :layout="layout"
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
                        <q-select v-model="filterBy" class="q-mr-md" :options="['none', 'lang', 'card']" outlined dense />
                    </template>

                    <template #append>
                        <q-btn
                            icon="mdi-magnify"
                            flat dense round
                            @click="doSearch"
                        />
                    </template>
                </q-input>
            </div>
            <div class="q-mb-md flex items-center">
                <q-select v-model="locale" class="q-mr-md" :options="locales" outlined dense />

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
                    <q-input v-model="lang" style="width: 60px;" outlined dense />
                    {{ `:${set},${number}` }}
                </div>

                <div v-else class="info q-mx-md">{{ info }}</div>

                <q-select v-model="layout" class="q-mr-md" :options="layoutOptions" outlined dense />

                <q-input v-model="releaseDate" flat dense outlined />

                <span v-if="dataGroup != null" class="q-ml-md">{{ `${total} (${loaded})` }}</span>

                <q-space />

                <q-btn
                    icon="mdi-merge"
                    :color="autoAssign ? 'primary' : 'black'"
                    dense flat round
                    @click="autoAssign = !autoAssign"
                />

                <q-btn
                    v-if="devOracle"
                    color="red" icon="mdi-alpha-o-circle-outline"
                    dense flat round
                    @click="devOracle = false"
                />

                <q-btn
                    :color="devPrintedColor" icon="mdi-alert-circle-outline"
                    dense flat round
                    @click="clickDevPrinted"
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
                <q-btn :icon="unlock ? 'mdi-lock-open' : 'mdi-lock'" dense flat round @click="unlock = !unlock" />
                <q-btn v-if="lang == 'en'" icon="mdi-arrow-right-bold" dense flat round @click="overwriteUnified" />
                <q-btn icon="mdi-scale-balance" dense flat round @click="getLegality" />
                <q-btn icon="mdi-book" dense flat round @click="extractRulingCards" />

                <q-btn
                    icon="mdi-ab-testing"
                    :color="separateKeyword ? 'primary' : 'black'"
                    dense flat round
                    @click="separateKeyword = !separateKeyword"
                />

                <q-btn
                    icon="mdi-card-multiple-outline"
                    :color="sample ? 'primary' : 'black'"
                    dense flat round
                    @click="sample = !sample"
                />

                <q-btn icon="mdi-skip-next" dense flat round @click="skipCurrent" />
                <q-btn icon="mdi-refresh" dense flat round @click="loadData" />
                <q-btn icon="mdi-upload" dense flat round @click="doUpdate" />
            </div>

            <table>
                <tr>
                    <th>Standard</th>
                    <th>Unified</th>
                    <th>Printed</th>
                </tr>
                <tr>
                    <td><q-input v-model="standardName" tabindex="1" outlined dense /></td>
                    <td><q-input v-model="unifiedName" tabindex="2" outlined dense /></td>
                    <td><q-input v-model="printedName" tabindex="3" outlined dense /></td>
                </tr>
                <tr>
                    <td><q-input v-model="standardTypeline" tabindex="1" outlined dense /></td>
                    <td><q-input v-model="unifiedTypeline" tabindex="2" outlined dense /></td>
                    <td><q-input v-model="printedTypeline" tabindex="3" outlined dense /></td>
                </tr>
                <tr class="text">
                    <td><q-input v-model="standardText" tabindex="1" outlined type="textarea" dense /></td>
                    <td><q-input v-model="unifiedText" tabindex="2" outlined type="textarea" dense /></td>
                    <td><q-input v-model="printedText" tabindex="3" outlined type="textarea" dense /></td>
                </tr>
            </table>

            <q-input v-model="flavorText" tabindex="4" class="q-mt-sm" autogrow label="Flavor Text" outlined type="textarea" />

            <div class="flex q-mt-sm">
                <q-input v-model="relatedCardsString" class="col" debounce="500" label="Related Cards" outlined dense />
            </div>

            <div>
                locked[card]: {{ cardLockedPaths.join(', ') }}
            </div>

            <div>
                locked[print]: {{ printLockedPaths.join(', ') }}
            </div>

            <div v-if="searchResult != null" class="q-mt-sm">
                <div v-for="(v, k) in searchResult" :key="k">
                    <div>{{ k }}</div>
                    <ul>
                        <li v-for="(e, i) in v" :key="i">{{ e }}</li>
                    </ul>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import {
    ref, computed, onMounted, watch, nextTick,
    ComputedRef,
} from 'vue';

import { useRouter, useRoute } from 'vue-router';
import { useGame } from 'store/games/lorcana';
import { useParam } from 'store/core';

import controlSetup from 'setup/control';

import CardImage from 'components/lorcana/CardImage.vue';
import CardAvatar from 'components/lorcana/CardAvatar.vue';

import { Layout } from '@interface/lorcana/print';
import { CardEditorView } from '@common/model/lorcana/card';

import { AxiosResponse } from 'axios';

import { copyToClipboard } from 'quasar';
import { debounce, deburr, isEqual } from 'lodash';

type CardGroup = {
    method: string;
    cards:  CardEditorView[];
    total:  number;
};

type History = {
    id:     string;
    set:    string;
    number: string;
    lang:   string;
};

const router = useRouter();
const route = useRoute();
const game = useGame();

const { controlGet, controlPost } = controlSetup();

const data = ref<CardEditorView>();
const dataGroup = ref<CardGroup>();
const history = ref<History[]>([]);
const unlock = ref(false);

const locales = computed(() => ['', ...game.locales]);

const locale = useParam('locale', {
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

const filterBy = useParam('filterBy', {
    type:    'enum',
    bind:    'query',
    name:    'fb',
    values:  ['none', 'lang', 'card'],
    default: 'none',
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

const autoAssign = useParam('autoAssign', {
    type:    'boolean',
    bind:    'query',
    name:    'aa',
    default: false,
});

const clearDevPrinted = useParam('clearDevPrinted', {
    type:    'boolean',
    bind:    'query',
    name:    'cp',
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

const card = computed(() => data.value?.card);
const print = computed(() => data.value?.print);

const inDatabase = computed(() => {
    if (data.value == null) {
        return false;
    }

    return card.value?._id != null && print.value?._id != null;
});

const id = computed({
    get() { return card.value?.cardId ?? route.query.id as string; },
    set(newValue: string) {
        if (card.value != null) {
            card.value.cardId = newValue;
        }

        if (print.value != null) {
            print.value.cardId = newValue;
        }
    },
});

const lang = computed({
    get() { return print.value?.lang ?? route.query.lang as string; },
    set(newValue: string) { if (print.value != null) { print.value.lang = newValue; } },
});

const set = computed(() => print.value?.set ?? route.query.set as string);
const number = computed(() => print.value?.number ?? route.query.number as string);

const info = computed(() => {
    if (data.value != null) {
        return `${lang.value}, ${set.value}:${number.value}`;
    } else {
        return '';
    }
});

const cardLink = computed(() => ({
    name:   'lorcana/card',
    params: { id: id.value },
    query:  {
        lang:   lang.value,
        set:    set.value,
        number: number.value,
    },
}));

const loaded = computed(() => dataGroup.value?.cards.length);
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

type Card = CardEditorView['card'];
type Print = CardEditorView['print'];

const lockPath = <T extends { __lockedPaths: string[] }>(value: ComputedRef<T | undefined>, path: string) => {
    if (value.value != null && !value.value.__lockedPaths.includes(path)) {
        value.value.__lockedPaths.push(path);
    }
};

const cardField = <F extends keyof Card>(firstKey: F, defaultValue?: Card[F], path?: string | (() => string)) => computed({
    get() { return (card.value?.[firstKey] ?? defaultValue)!; },
    set(newValue: Card[F]) {
        if (data.value != null && !isEqual(card.value![firstKey], newValue)) {
            card.value![firstKey] = newValue;

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

const standardName = cardField('name', '', 'name');
const standardTypeline = cardField('typeline', '', 'typeline');
const standardText = cardField('text', '', 'text');

const printedName = printField('name', '', 'name');
const printedTypeline = printField('typeline', '', 'typeline');
const printedText = printField('text', '', 'text');

const unifiedName = computed({
    get() {
        if (card.value == null) {
            return '';
        }

        return card.value.localization.find(
            l => l.lang === lang.value,
        )?.name ?? '';
    },
    set(newValue) {
        if (card.value == null) {
            return;
        }

        const localization = card.value.localization.find(
            l => l.lang === lang.value,
        );

        if (localization == null) {
            card.value.localization.push({
                lang: lang.value, lastDate: '', name: newValue, typeline: '', text: '',
            });
        } else if (localization.name !== newValue) {
            localization.name = newValue;
            lockPath(card, `localization[${lang.value}].name`);
        }
    },
});

const unifiedTypeline = computed({
    get() {
        if (card.value == null) {
            return '';
        }

        return card.value.localization.find(
            l => l.lang === lang.value,
        )?.typeline ?? '';
    },
    set(newValue) {
        if (card.value == null) {
            return;
        }

        const localization = card.value.localization.find(
            l => l.lang === lang.value,
        );

        if (localization == null) {
            card.value.localization.push({
                lang: lang.value, lastDate: '', name: '', typeline: newValue, text: '',
            });
        } else if (localization.typeline !== newValue) {
            localization.typeline = newValue;
            lockPath(card, `localization[${lang.value}].typeline`);
        }
    },
});

const unifiedText = computed({
    get() {
        if (card.value == null) {
            return '';
        }

        return card.value.localization.find(
            l => l.lang === lang.value,
        )?.text ?? '';
    },
    set(newValue) {
        if (card.value == null) {
            return;
        }

        const localization = card.value.localization.find(
            l => l.lang === lang.value,
        );

        if (localization == null) {
            card.value.localization.push({
                lang: lang.value, lastDate: '', name: '', typeline: '', text: newValue,
            });
        } else if (localization.text !== newValue) {
            localization.text = newValue;
            lockPath(card, `localization[${lang.value}].text`);
        }
    },
});

const flavorText = printField('flavorText', '', 'flavorText');
const releaseDate = printField('releaseDate', '', 'releaseDate');

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

        return (print.value.tags ?? []).includes(`dev:${name}`);
    },
    set(newValue: boolean) {
        if (print.value == null) {
            return;
        }

        if (newValue) {
            if (print.value.tags != null && !print.value.tags.includes(`dev:${name}`)) {
                print.value.tags.push(`dev:${name}`);
            }
        } else {
            print.value.tags = print.value.tags.filter(v => v !== `dev:${name}`);
        }
    },
});

const devPrinted = printTag('printed');
const devOracle = cardTag('oracle');
const devToken = cardTag('token');
const devCounter = cardTag('counter');

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
            let [relation, cardId, lang, set, number] = p.split('|');

            if (relation.length === 1) {
                relation = {
                    t: 'token',
                    i: 'intext',
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
                return { relation, cardId, version: { lang, set, number } };
            } else {
                return { relation, cardId };
            }
        });

        devToken.value = false;
    },
});

const cardLockedPaths = computed({
    get() { return card.value?.__lockedPaths ?? []; },
    set(newValue) {
        if (card.value != null) {
            card.value.__lockedPaths = newValue;
        }
    },
});

const printLockedPaths = computed({
    get() { return print.value?.__lockedPaths ?? []; },
    set(newValue) {
        if (print.value != null) {
            print.value.__lockedPaths = newValue;
        }
    },
});

const searchResult = computed(() => {
    const result = (data.value as any)?.result;

    if (result == null) {
        return null;
    }

    // if (result.method === 'oracle') {
    //     return Object.fromEntries(
    //         Object.entries(result)
    //             .filter(([k, v]) => {
    //                 switch (k) {
    //                 case 'method':
    //                 case '_id':
    //                     return false;
    //                 case '__oracle':
    //                     return v.length > 0;
    //                 default:
    //                     return v.length > 1;
    //                 }
    //             })
    //             .map(([k, v]) => {
    //                 switch (k) {
    //                 case 'relatedCards':
    //                     return [
    //                         k,
    //                         v.map((e: CardTemp['relatedCards']) => e.map(
    //                             ({ relation, cardId, version }) => (version != null
    //                                 ? [relation, cardId, version.lang, version.set, version.number]
    //                                 : [relation, cardId]
    //                             ).join('|'),
    //                         ).join('; ') ?? ''),
    //                     ];
    //                 default:
    //                     return [k, v];
    //                 }
    //             }),
    //     );
    // } else if (result.method === 'unified') {
    //     return Object.fromEntries(
    //         Object.entries(result)
    //             .filter(([k, v]) => {
    //                 switch (k) {
    //                 case 'method':
    //                 case '_id':
    //                     return false;
    //                 default:
    //                     return v.length > 1;
    //                 }
    //             }),
    //     );
    // }

    return null;
});

const separatorReplacer = (text: string) => text
    .replace(/•| · /g, '·');

const defaultTypelinePrettifier = (typeline: string, _lang: string) => {
    typeline = typeline
        .trim()
        .replace(/\s/g, ' ');

    return separatorReplacer(typeline);
};

const defaultTextPrettifier = (text: string, lang: string) => {
    text = text
        .trim()
        .replace(/[^\S\n]+$|^[^\S\n]+/mg, '')
        .replace(/\n{2,}/g, '\n');

    if (lang === 'zhs' || lang === 'zht') {
        if (!/[a-wyz](?![/}])/.test(text)) {
            text = text
                .replace(/(?<!•)(?<!\]) /g, '')
                .replace(/,/g, '，')
                .replace(/\(/g, '（')
                .replace(/\)/g, '）')
                .replace(/!/g, '！')
                .replace(/:/g, '：')
                .replace(/;/g, '；')
                .replace(/\?/g, '？')
                .replace(/––/g, '——')
                .replace(/~/g, '～');
        }
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

    text = text
        .replace(/\](?! )/g, '] ');

    return text;
};

const defaultPrettify = () => {
    if (data.value == null) {
        return;
    }

    standardName.value = separatorReplacer(standardName.value);
    unifiedName.value = separatorReplacer(unifiedName.value);
    printedName.value = separatorReplacer(printedName.value);

    standardTypeline.value = defaultTypelinePrettifier(standardTypeline.value, lang.value);
    unifiedTypeline.value = defaultTypelinePrettifier(unifiedTypeline.value, lang.value);
    printedTypeline.value = defaultTypelinePrettifier(printedTypeline.value, lang.value);

    standardText.value = defaultTextPrettifier(standardText.value, lang.value);
    unifiedText.value = defaultTextPrettifier(unifiedText.value, lang.value);
    printedText.value = defaultTextPrettifier(printedText.value, lang.value);

    flavorText.value = defaultTextPrettifier(flavorText.value, lang.value);

    if (clearDevPrinted.value) {
        devPrinted.value = false;
    }
};

const prettify = () => {
    if (data.value == null) {
        return;
    }

    if (lang.value !== 'en') {
        if (standardName.value !== unifiedName.value) {
            if (standardName.value === printedName.value || printedName.value === '') {
                printedName.value = unifiedName.value;
            }
        }

        if (standardName.value !== printedName.value) {
            if (standardName.value === unifiedName.value || unifiedName.value === '') {
                unifiedName.value = printedName.value;
            }
        }

        if (standardTypeline.value !== unifiedTypeline.value) {
            if (standardTypeline.value === printedTypeline.value || printedTypeline.value === '') {
                printedTypeline.value = unifiedTypeline.value;
            }
        }

        if (standardTypeline.value !== printedTypeline.value) {
            if (standardTypeline.value === unifiedTypeline.value || unifiedTypeline.value === '') {
                unifiedTypeline.value = printedTypeline.value;
            }
        }

        if (standardText.value !== unifiedText.value) {
            if (standardText.value === printedText.value || printedText.value === '') {
                printedText.value = unifiedText.value;
            }
        }

        if (standardText.value !== printedText.value) {
            if (standardText.value === unifiedText.value || unifiedText.value === '') {
                unifiedText.value = printedText.value;
            }
        }
    }

    defaultPrettify();

    if (replaceFrom.value !== '') {
        const fromRegex = new RegExp(replaceFrom.value, 'ugm');
        const toReplacer = (text: string, ...captures: string[]) => replaceTo.value
            .replace(/\\n/g, '\n')
            .replace(/\$(\d)/g, (_, num) => captures[Number.parseInt(num, 10) - 1]);

        if (replaceUnified.value) {
            unifiedText.value = unifiedText.value!.replace(fromRegex, toReplacer);
            unifiedTypeline.value = unifiedTypeline.value.replace(fromRegex, toReplacer);
        }

        if (replacePrinted.value) {
            printedText.value = printedText.value!.replace(fromRegex, toReplacer);
            printedTypeline.value = printedTypeline.value.replace(fromRegex, toReplacer);
        }
    }

    defaultPrettify();

    if (lang.value === 'zhs') {
        unifiedTypeline.value = unifiedTypeline.value.replace(/^Character/, '角色');
        printedTypeline.value = printedTypeline.value.replace(/^Character/, '角色');
    }
};

const overwriteUnified = () => {
    if (lang.value !== 'en') {
        return;
    }

    unifiedName.value = standardName.value;
    unifiedTypeline.value = standardTypeline.value;
    unifiedText.value = standardText.value!.replace(/ *[(（][^)）]+[)）] */g, '').trim();
};

const getLegality = async () => {
    const { data: result } = await controlGet('/lorcana/card/get-legality', {
        id: id.value,
    });

    console.log(result);
};

const extractRulingCards = async () => {
    const { data: cards } = await controlGet('/lorcana/card/extract-ruling-cards', {
        id: id.value,
    });

    console.log(cards);
};

(window as any).extract = async (ids: string[]) => {
    await controlGet('/lorcana/card/extract-ruling-cards', {
        id: ids.join(','),
    });
};

const newData = () => {
    if (data.value == null) {
        return;
    }

    const oldPrint = data.value.print;

    delete oldPrint._id;

    delete oldPrint.id;
    delete oldPrint.code;
    delete oldPrint.tcgPlayerId;
    delete oldPrint.cardMarketId;
    delete oldPrint.cardTraderId;

    unlock.value = true;
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
            set:    set.value,
            number: number.value,
            lang:   lang.value,
        });

        await controlPost('/lorcana/card/update', {
            data: card.value,
        });

        await controlPost('/lorcana/print/update', {
            data: print.value,
        });

        await controlPost('/lorcana/card/update-related', {
            id:      card.value!.cardId,
            related: relatedCards.value,
        });
    },
    1000,
    {
        leading:  true,
        trailing: false,
    },
);

const loadData = async () => {
    if (id.value != null && lang.value != null && set.value != null && number.value != null) {
        const { data: result } = await controlGet<CardEditorView>('/lorcana/card/raw', {
            id:     id.value,
            lang:   lang.value,
            set:    set.value,
            number: number.value,
        });

        data.value = result;
    }
};

onMounted(loadData);

const loadGroup = async (method: string, skip = false) => {
    if (data.value != null && !skip) {
        await doUpdate();

        await (async (time: number) => new Promise(resolve => { setTimeout(resolve, time); }))(100);
    }

    if (dataGroup.value != null && dataGroup.value.method === method && dataGroup.value.cards?.length > 0) {
        data.value = dataGroup.value.cards.shift();
        dataGroup.value.total -= 1;
        return;
    }

    let request: AxiosResponse<CardGroup>;

    const sampleValue = sample.value ? 50 : 1;

    if (method.startsWith('search:')) {
        request = await controlGet<CardGroup>('/lorcana/card/search', {
            'q':         search.value,
            'sample':    sampleValue,
            'filter-by': filterBy.value,
        });
    } else {
        request = await controlGet<CardGroup>('/lorcana/card/need-edit', {
            method,
            'lang':      locale.value === '' ? null : locale.value,
            'sample':    sampleValue,
            'filter-by': filterBy.value,
        });
    }

    const result = request.data;

    if (result != null && result.total !== 0) {
        dataGroup.value = result;
        data.value = dataGroup.value.cards.shift();
    } else {
        dataGroup.value = undefined;
        data.value = undefined;
    }
};

watch([sample, locale, filterBy], () => { dataGroup.value = undefined; });

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
    [data, printedName, printedTypeline, printedText],
    ([newValue], [oldValue]) => {
        if (newValue === oldValue) {
            devPrinted.value = false;
        }
    },
);

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

</style>
