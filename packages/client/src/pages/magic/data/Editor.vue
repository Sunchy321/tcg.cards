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

                <q-btn
                    icon="mdi-credit-card-scan-outline"
                    dense flat round
                    @click="scanCardText"
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
                    <th>Oracle</th>
                    <th>Unified</th>
                    <th>Printed</th>
                </tr>
                <tr>
                    <td>
                        <q-input
                            v-model="oracleName"
                            tabindex="1" :readonly="!unlock"
                            outlined dense
                        />
                    </td>
                    <td><q-input v-model="unifiedName" tabindex="2" outlined dense /></td>
                    <td><q-input v-model="printedName" tabindex="3" outlined dense /></td>
                </tr>
                <tr>
                    <td>
                        <q-input
                            v-model="oracleTypeline"
                            tabindex="1" :readonly="!unlock"
                            outlined dense
                        />
                    </td>
                    <td><q-input v-model="unifiedTypeline" tabindex="2" outlined dense /></td>
                    <td><q-input v-model="printedTypeline" tabindex="3" outlined dense /></td>
                </tr>
                <tr class="text">
                    <td>
                        <q-input
                            v-model="oracleText"
                            tabindex="1" :readonly="!unlock"
                            outlined type="textarea" dense
                        />
                    </td>
                    <td><q-input v-model="unifiedText" tabindex="2" outlined type="textarea" dense /></td>
                    <td><q-input v-model="printedText" tabindex="3" outlined type="textarea" dense /></td>
                </tr>
            </table>

            <q-input v-model="flavorText" class="q-mt-sm" autogrow label="Flavor Text" outlined type="textarea" />

            <div class="flex q-mt-sm">
                <q-input v-model="flavorName" class="col" label="Flavor Name" outlined dense />

                <!-- eslint-disable-next-line max-len -->
                <array-input v-model="multiverseId" class="col q-ml-sm" label="Multiverse ID" is-number outlined dense>
                    <template #append>
                        <q-btn icon="mdi-image" flat dense round @click="saveGathererImage" />
                        <q-btn icon="mdi-magnify" flat dense round @click="loadGatherer" />
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
                        <q-btn icon="mdi-card-plus-outline" flat dense round @click="guessToken" />
                    </template>
                </q-input>

                <array-input v-model="counters" class="col q-ml-sm" label="Counters" outlined dense>
                    <template #append>
                        <q-btn icon="mdi-magnify" flat dense round @click="guessCounter" />
                    </template>
                </array-input>
            </div>

            <div>
                locked[card]: {{ cardLockedPaths.join(', ') }}
            </div>

            <div>
                locked[print]: {{ printLockedPaths.join(', ') }}
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
import { useMagic } from 'store/games/magic';

import controlSetup from 'setup/control';
import pageSetup from 'setup/page';

import ArrayInput from 'components/ArrayInput.vue';
import CardImage from 'components/magic/CardImage.vue';
import CardAvatar from 'components/magic/CardAvatar.vue';

import { Layout } from 'interface/magic/print';
import { CardEditorView } from 'common/model/magic/card';

import { AxiosResponse } from 'axios';

import {
    debounce, deburr, isEqual, uniq, upperFirst,
    zip,
} from 'lodash';

import { copyToClipboard } from 'quasar';

import { parenRegex, commaRegex } from 'static/magic/special';

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

const predefinedNames = ['Gold', 'Clue', 'Treasure', 'Food', 'Walker', 'Shard', 'Blood', 'Powerstone', 'Map', 'Junk'];

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
    'each',
    'had',
    'has',
    'have',
    'more',
    'no',
    'of',
    'the',
    'those',
    'with',
    'X',
    'another',
    'moved',
    'that',
    'three',
];

const router = useRouter();
const route = useRoute();
const magic = useMagic();

const { controlGet, controlPost } = controlSetup();

const data = ref<CardEditorView>();
const dataGroup = ref<CardGroup>();
const history = ref<History[]>([]);
const unlock = ref(false);

const locales = computed(() => ['', ...magic.locales]);

const {
    locale,
    sp: sample,
    fp: forcePrettify,
    fb: filterBy,
    sk: separateKeyword,
    ru: replaceUnified,
    rp: replacePrinted,
    rf: replaceFrom,
    rt: replaceTo,
    cp: clearDevPrinted,
} = pageSetup({
    params: {
        locale: {
            type:    'enum',
            bind:    'query',
            values:  locales,
            default: '',
        },

        sp: {
            type:    'boolean',
            bind:    'query',
            default: true,
        },

        fb: {
            type:    'enum',
            bind:    'query',
            values:  ['none', 'lang', 'card'],
            default: 'none',
        },

        fp: {
            type:    'boolean',
            bind:    'query',
            default: false,
        },

        sk: {
            type:    'boolean',
            bind:    'query',
            default: false,
        },

        ru: {
            type:    'boolean',
            bind:    'query',
            default: false,
        },

        rp: {
            type:    'boolean',
            bind:    'query',
            default: false,
        },

        rf: {
            type:    'string',
            bind:    'query',
            default: '',
        },

        rt: {
            type:    'string',
            bind:    'query',
            default: '',
        },

        aa: {
            type:    'boolean',
            bind:    'query',
            default: false,
        },

        cp: {
            type:    'boolean',
            bind:    'query',
            default: false,
        },
    },

    appendParam: true,
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
    name:   'magic/card',
    params: { id: id.value },
    query:  {
        lang:   lang.value,
        set:    set.value,
        number: number.value,
    },
}));

const partCount = computed(() => data.value?.card.parts.length ?? 0);

const partIndex = computed({
    get() {
        if (data.value?.partIndex != null) {
            return data.value.partIndex;
        }

        if (route.query.part != null) {
            const result = parseInt(route.query.part as string, 10);

            if (result < partCount.value) {
                return result;
            }
        }

        return 0;
    },
    set(newValue: number) {
        if (data.value?.partIndex != null) {
            data.value.partIndex = newValue;
        } else {
            router.replace({
                query: {
                    ...route.query,
                    part: newValue,
                },
            });
        }
    },
});

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

const partOptions = computed(() => {
    const result = [];

    for (let i = 0; i < partCount.value; i += 1) {
        result.push({ value: i, label: i.toString() });
    }

    return result;
});

type CardPart = CardEditorView['card']['parts'][0];
type PrintPart = CardEditorView['print']['parts'][0];

const cardPart = computed(() => card?.value?.parts?.[partIndex.value]);
const printPart = computed(() => print?.value?.parts?.[partIndex.value]);

const lockPath = <T extends { __lockedPaths: string[] }>(value: ComputedRef<T | undefined>, path: string) => {
    if (value.value != null && !value.value.__lockedPaths.includes(path)) {
        value.value.__lockedPaths.push(path);
    }
};

const cardPartField = <F extends keyof CardPart>(firstKey: F, defaultValue?: CardPart[F], path?: string | (() => string)) => computed({
    get() { return (cardPart.value?.[firstKey] ?? defaultValue)!; },
    set(newValue: CardPart[F]) {
        if (data.value != null) {
            cardPart.value![firstKey] = newValue;

            if (path != null) {
                const realPath = typeof path === 'string' ? path : path();

                lockPath(card, realPath);
            }
        }
    },
});

const printPartField = <F extends keyof PrintPart>(firstKey: F, defaultValue?: PrintPart[F], path?: string | (() => string)) => computed({
    get() { return (printPart.value?.[firstKey] ?? defaultValue)!; },
    set(newValue: PrintPart[F]) {
        if (data.value != null && !isEqual(printPart.value![firstKey], newValue)) {
            printPart.value![firstKey] = newValue;

            if (path != null) {
                const realPath = typeof path === 'string' ? path : path();

                lockPath(print, realPath);
            }
        }
    },
});

// const partField2 = <
//     F extends keyof Part,
//     L extends keyof Part[F],
// >(firstKey: F, lastKey: L, defaultValue?: Part[F][L]) => computed({
//     get(): Part[F][L] {
//         // eslint-disable-next-line @typescript-eslint/no-unsafe-return
//         return ((part.value as any)?.[firstKey]?.[lastKey] ?? defaultValue)!;
//     },
//     set(newValue: Part[F][L]) {
//         if (data.value != null) {
//             (part.value as any)![firstKey][lastKey] = newValue;
//         }
//     },
// });

const oracleName = cardPartField('name', '');
const oracleTypeline = cardPartField('typeline', '');
const oracleText = cardPartField('text', '');

const printedName = printPartField('name', '', () => `parts[${partIndex.value}].name`);
const printedTypeline = printPartField('typeline', '', () => `parts[${partIndex.value}].typeline`);
const printedText = printPartField('text', '', () => `parts[${partIndex.value}].text`);

const unifiedName = computed({
    get() {
        if (cardPart.value == null) {
            return '';
        }

        return cardPart.value.localization.find(
            l => l.lang === lang.value,
        )?.name ?? '';
    },
    set(newValue) {
        if (cardPart.value == null) {
            return;
        }

        const localization = cardPart.value.localization.find(
            l => l.lang === lang.value,
        );

        if (localization == null) {
            cardPart.value.localization.push({
                lang: lang.value, name: newValue, typeline: '', text: '', lastDate: releaseDate.value,
            });
        } else if (localization.name !== newValue) {
            localization.name = newValue;
            lockPath(card, `parts[${partIndex.value}].localization[${lang.value}].name`);
        }
    },
});

const unifiedTypeline = computed({
    get() {
        if (cardPart.value == null) {
            return '';
        }

        return cardPart.value.localization.find(
            l => l.lang === lang.value,
        )?.typeline ?? '';
    },
    set(newValue) {
        if (cardPart.value == null) {
            return;
        }

        const localization = cardPart.value.localization.find(
            l => l.lang === lang.value,
        );

        if (localization == null) {
            cardPart.value.localization.push({
                lang: lang.value, name: '', typeline: newValue, text: '', lastDate: releaseDate.value,
            });
        } else if (localization.typeline !== newValue) {
            localization.typeline = newValue;
            lockPath(card, `parts[${partIndex.value}].localization[${lang.value}].typeline`);
        }
    },
});

const unifiedText = computed({
    get() {
        if (cardPart.value == null) {
            return '';
        }

        return cardPart.value.localization.find(
            l => l.lang === lang.value,
        )?.text ?? '';
    },
    set(newValue) {
        if (cardPart.value == null) {
            return;
        }

        const localization = cardPart.value.localization.find(
            l => l.lang === lang.value,
        );

        if (localization == null) {
            cardPart.value.localization.push({
                lang: lang.value, name: '', typeline: '', text: newValue, lastDate: releaseDate.value,
            });
        } else if (localization.text !== newValue) {
            localization.text = newValue;
            lockPath(card, `parts[${partIndex.value}].localization[${lang.value}].text`);
        }
    },
});

const flavorText = printPartField('flavorText', '');
const flavorName = printPartField('flavorName', '');

const releaseDate = computed(() => print.value?.releaseDate);

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
                return { relation, cardId, version: { lang, set, number } };
            } else {
                return { relation, cardId };
            }
        });

        devToken.value = false;
    },
});

const counters = computed({
    get() { return card.value?.counters ?? []; },
    set(newValue: string[]) {
        if (card.value == null) {
            return;
        }

        newValue = uniq(newValue).sort();

        devCounter.value = false;

        if (newValue.length === 0) {
            delete card.value?.counters;
        } else {
            card.value.counters = newValue.sort();
        }
    },
});

const multiverseId = computed({
    get() { return print.value?.multiverseId ?? []; },
    set(newValue: number[]) {
        if (print.value != null) {
            print.value.multiverseId = newValue;
        }
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

const defaultTypelinePrettifier = (typeline: string, lang: string) => {
    typeline = typeline
        .trim()
        .replace(/\s/g, ' ')
        .replace(/ *～ *-? */, '～')
        .replace(/ *(--|[―—–]) *-? */, ' — ')
        .replace(/ *: *-? */, ' : ');

    if (lang === 'zhs' || lang === 'zht') {
        typeline = typeline.replace(/~/g, '～').replace(/\//g, '／');
    } else {
        typeline = typeline.replace(/ - /g, ' — ').trim();
    }

    return typeline;
};

const defaultTextPrettifier = (text: string, lang: string, name: string) => {
    text = text.replace(/~~/g, name);

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
                .replace(/(?<!•)(?<!\d-\d)(?<!\d\+)(?<!—) (?!—|II|IV|V)/g, '')
                .replace(/\(/g, '（')
                .replace(/\)/g, '）')
                .replace(/;/g, '；');
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

    return text;
};

const defaultPrettify = () => {
    if (data.value == null) {
        return;
    }

    for (const [i, p] of card.value!.parts.entries()) {
        const loc = p.localization.find(l => l.lang === lang.value);

        if (loc != null) {
            if (i === partIndex.value) {
                unifiedTypeline.value = defaultTypelinePrettifier(unifiedTypeline.value, lang.value);
                unifiedText.value = defaultTextPrettifier(unifiedText.value, lang.value, loc.name);
            } else {
                loc.typeline = defaultTypelinePrettifier(loc.typeline, lang.value);
                loc.text = defaultTextPrettifier(loc.text, lang.value, loc.name);
            }
        }
    }

    for (const [i, p] of print.value!.parts.entries()) {
        if (i === partIndex.value) {
            printedTypeline.value = defaultTypelinePrettifier(printedTypeline.value, lang.value);
            printedText.value = defaultTextPrettifier(printedText.value, lang.value, p.name);
        } else {
            p.typeline = defaultTypelinePrettifier(p.typeline, lang.value);
            p.text = defaultTextPrettifier(p.text, lang.value, p.name);
        }

        if (p.flavorText != null && p.flavorText !== '') {
            if (lang.value === 'zhs' || lang.value === 'zht') {
                p.flavorText = p.flavorText
                    .replace(/~/g, '～')
                    .replace(/\.\.\./g, '…')
                    .replace(/」 ?～/g, '」\n～')
                    .replace(/。 ?～/g, '。\n～')
                    .replace(/([，。！？：；]) /g, (m: any, m1: string) => m1);
            }

            if (lang.value === 'de') {
                p.flavorText = p.flavorText
                    .replace(/"/g, '“')
                    .replace(/'/g, '‘');
            }

            if (lang.value === 'fr') {
                p.flavorText = p.flavorText
                    .replace(/<</g, '«')
                    .replace(/>>/g, '»');
            }
        }
    }

    if (clearDevPrinted.value) {
        devPrinted.value = false;
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
                .replace(/[-+0-9X()]+(?!\})/g, replacer);
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

    if (data.value.card.parts.length === 2) {
        const [front, back] = data.value.card.parts;

        for (const [frontLoc, backLoc] of zip(front.localization, back.localization)) {
            if (frontLoc == null || backLoc == null) {
                continue;
            }

            if (frontLoc.name === backLoc.name && frontLoc.name.includes(' // ')) {
                [frontLoc.name, backLoc.name] = frontLoc.name.split(' // ');
            }

            if (frontLoc.typeline === backLoc.typeline && frontLoc.typeline.includes(' // ')) {
                [frontLoc.typeline, backLoc.typeline] = frontLoc.typeline.split(' // ');
            }
        }
    }

    if (data.value.print.parts.length === 2) {
        const [front, back] = data.value.print.parts;

        if (front.name === back.name && front.name.includes(' // ')) {
            [front.name, back.name] = front.name.split(' // ');
        }

        if (front.typeline === back.typeline && front.typeline.includes(' // ')) {
            [front.typeline, back.typeline] = front.typeline.split(' // ');
        }
    }

    unifiedText.value = unifiedText.value!
        .replace(new RegExp(parenRegex.source, 'g'), '').trim();

    if (separateKeyword.value) {
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

const overwriteUnified = () => {
    if (lang.value !== 'en') {
        return;
    }

    unifiedName.value = oracleName.value;
    unifiedTypeline.value = oracleTypeline.value;
    unifiedText.value = oracleText.value!.replace(/ *[(（][^)）]+[)）] */g, '').trim();
};

const getLegality = async () => {
    const { data: result } = await controlGet('/magic/card/get-legality', {
        id: id.value,
    });

    console.log(result);
};

const extractRulingCards = async () => {
    const { data: cards } = await controlGet('/magic/card/extract-ruling-cards', {
        id: id.value,
    });

    console.log(cards);
};

(window as any).extract = async (ids: string[]) => {
    await controlGet('/magic/card/extract-ruling-cards', {
        id: ids.join(','),
    });
};

type ScanResult = {
    name:     string;
    typeline: string;
    text:     string;
};

const scanCardText = async () => {
    if (data.value == null) {
        return;
    }

    const { data: result } = await controlGet<ScanResult>('/magic/card/scan-card-text', {
        id:        id.value,
        set:       set.value,
        number:    number.value,
        lang:      lang.value,
        layout:    layout.value,
        partIndex: partIndex.value,
    });

    printedName.value = result.name;
    printedTypeline.value = result.typeline;
    printedText.value = result.text;
};

const newData = () => {
    if (data.value == null) {
        return;
    }

    const oldPrint = data.value.print;

    delete oldPrint._id;

    for (const p of oldPrint.parts) {
        delete p.scryfallIllusId;
    }

    delete oldPrint.scryfall.cardId;
    oldPrint.scryfall.imageUris = [];
    delete oldPrint.arenaId;
    delete oldPrint.mtgoId;
    delete oldPrint.mtgoFoilId;
    oldPrint.multiverseId = [];
    delete oldPrint.tcgPlayerId;
    delete oldPrint.cardMarketId;

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

        await controlPost('/magic/card/update', {
            data: card.value,
        });

        await controlPost('/magic/print/update', {
            data: print.value,
        });

        if (dataGroup.value?.method == null || dataGroup.value.method.startsWith('search:')) {
            await controlPost('/magic/card/update-related', {
                id:      card.value!.cardId,
                related: relatedCards.value,
            });
        }
    },
    1000,
    {
        leading:  true,
        trailing: false,
    },
);

const loadData = async () => {
    if (id.value != null && lang.value != null && set.value != null && number.value != null) {
        const { data: result } = await controlGet<CardEditorView>('/magic/card/raw', {
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
        request = await controlGet<CardGroup>('/magic/card/search', {
            'q':         search.value,
            'sample':    sampleValue,
            'filter-by': filterBy.value,
        });
    } else {
        request = await controlGet<CardGroup>('/magic/card/need-edit', {
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
    [data, partIndex, printedName, printedTypeline, printedText],
    ([newValue, newIndex], [oldValue, oldIndex]) => {
        if (newValue === oldValue && newIndex === oldIndex) {
            devPrinted.value = false;
        }
    },
);

const guessToken = () => {
    if (data.value == null) {
        return;
    }

    const relatedCardsCopy = [...relatedCards.value];

    for (const text of data.value.card.parts.map(p => p.text ?? '')) {
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

            if (relatedCardsCopy.every(r => r.cardId !== tokenId)) {
                relatedCardsCopy.push({ relation: 'token', cardId: tokenId });
            }
        }

        if (/^(Embalm|Eternalize|Squad|Offspring)/m.test(text)) {
            relatedCardsCopy.push({ relation: 'token', cardId: `${id.value}!` });
        }

        if (/\bincubates?\b/i.test(text)) {
            relatedCardsCopy.push({ relation: 'token', cardId: 'incubator!' });
        }
    }

    relatedCards.value = relatedCardsCopy;
};

const guessCounter = () => {
    if (data.value == null) {
        return;
    }

    for (const text of data.value.card.parts.map(p => p.text ?? '')) {
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
    }
};

const refreshToken = ref('');

const loadGatherer = async () => {
    if (data.value == null) {
        return;
    }

    await controlGet('/magic/print/parse-gatherer', {
        id:     multiverseId.value.join(','),
        set:    set.value,
        number: number.value,
        lang:   lang.value,
    });

    refreshToken.value = crypto.randomUUID();
};

const saveGathererImage = async () => {
    if (data.value == null) {
        return;
    }

    await controlGet('/magic/print/save-gatherer-image', {
        id:     multiverseId.value.join(','),
        set:    set.value,
        number: number.value,
        lang:   lang.value,
    });

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

</style>
