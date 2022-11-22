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
            />
            <div class="history q-mt-md">
                <div class="code text-center">{{ history.length }}</div>
                <div
                    v-for="(h, i) in history.slice(0, 5)"
                    :key="i"
                    class="flex justify-center"
                >
                    <card-avatar :id="h.id" :version="h" />
                </div>
            </div>
        </div>
        <div class="col">
            <div class="q-mb-md">
                <q-input v-model="search" dense @keypress.enter="doSearch">
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
                <q-btn-group outline>
                    <q-btn outline label="oracle" @click="loadGroup('oracle')" />
                    <q-btn outline label="lang" @click="loadGroup('unified')" />
                    <q-btn outline label="paren" @click="loadGroup('paren')" />
                    <q-btn outline label="token" @click="loadGroup('token')" />
                </q-btn-group>

                <span v-if="dataGroup != null" class="q-ml-md">{{ `${total} (${loaded})` }}</span>

                <q-space />

                <q-btn
                    class="q-mx-md"
                    outline
                    label="prettify"
                    @click="prettify"
                />

                <q-input v-model="replaceFrom" class="inline-flex" dense />
                <q-icon name="mdi-arrow-right" class="q-mx-md" />
                <q-input v-model="replaceTo" class="inline-flex" dense />
            </div>

            <div class="id-line flex items-center">
                <q-icon
                    class="q-mr-md"
                    :name="dbId == null ? 'mdi-database-remove': 'mdi-database-check'"
                    :color="dbId == null ? 'red' : undefined"
                    size="sm"
                />

                <q-input
                    v-if="unlock"
                    v-model="id"
                    class="id code"
                    dense outlined
                />

                <div v-else class="id code">{{ id }}</div>

                <div v-if="unlock" class="info flex items-center q-mx-md">
                    <q-input v-model="lang" style="width: 120px;" outlined dense />
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

                <q-space />

                <q-btn
                    v-if="devPrinted"
                    color="red" icon="mdi-alert-circle-outline"
                    dense flat round
                    @click="devPrinted = false"
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
                    icon="mdi-card-multiple-outline"
                    :color="sample ? 'primary' : 'black'"
                    dense flat round
                    @click="sample = !sample"
                />

                <q-btn icon="mdi-refresh" dense flat round @click="loadData" />
                <q-btn icon="mdi-upload" dense flat round @click="doUpdate" />
            </div>

            <table>
                <tr>
                    <th>
                        Oracle
                        <q-toggle
                            v-if="oracleUpdated != null"
                            v-model="showBeforeUpdate"
                            icon="mdi-history"
                            dense flat round
                        />
                    </th>
                    <th>Unified</th>
                    <th>Printed</th>
                </tr>
                <tr>
                    <td>
                        <q-input
                            v-model="displayOracleName"
                            tabindex="1" :readonly="!unlock"
                            :filled="displayOracleName !== oracleName"
                            outlined dense
                        />
                    </td>
                    <td><q-input v-model="unifiedName" tabindex="2" outlined dense /></td>
                    <td><q-input v-model="printedName" tabindex="3" outlined dense /></td>
                </tr>
                <tr>
                    <td>
                        <q-input
                            v-model="displayOracleTypeline"
                            tabindex="1" :readonly="!unlock"
                            :filled="displayOracleTypeline !== oracleTypeline"
                            outlined dense
                        />
                    </td>
                    <td><q-input v-model="unifiedTypeline" tabindex="2" outlined dense /></td>
                    <td><q-input v-model="printedTypeline" tabindex="3" outlined dense /></td>
                </tr>
                <tr class="text">
                    <td>
                        <q-input
                            v-model="displayOracleText"
                            tabindex="1" :readonly="!unlock"
                            :filled="displayOracleText !== oracleText"
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
                        <q-btn icon="mdi-magnify" flat dense round @click="loadGatherer" />
                    </template>
                </array-input>
            </div>

            <div class="flex q-mt-sm">
                <q-input v-model="relatedCardsString" class="col" debounce="500" label="Related Cards" outlined dense>
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
        </div>
    </div>
</template>

<style lang="sass" scoped>
.inline-flex
    display: inline-flex

.card-not-found
    width: 100%
    background-color: transparent !important
    padding: 0 !important

div.id
    max-width: 35ch
    overflow: hidden
    text-overflow: ellipsis

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

<script lang="ts">
import {
    defineComponent, ref, computed, onMounted, watch,
} from 'vue';

import { useRouter, useRoute } from 'vue-router';
import { useMagic } from 'store/games/magic';

import controlSetup from 'setup/control';

import ArrayInput from 'components/ArrayInput.vue';
import CardImage from 'components/magic/CardImage.vue';
import CardAvatar from 'components/magic/CardAvatar.vue';

import { Card, Layout } from 'interface/magic/card';

import { AxiosResponse } from 'axios';

import {
    debounce, deburr, escapeRegExp, uniq,
} from 'lodash';

type Part = Card['parts'][0];

type CardData = Card & {
    _id?: string;
    __oracle?: {
        name?: string;
        typeline?: string;
        text?: string;
    };
    partIndex?: number;
};

type CardGroup = {
    method: string;
    cards: CardData[];
    total: number;
};

type History = {
    id: string;
    set: string;
    number: string;
    lang: string;
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

const predefinedNames = ['Gold', 'Clue', 'Treasure', 'Food', 'Walker', 'Shard', 'Blood', 'Powerstone'];

const numberRegex = '(?:[a-z]+|a number of|(?:twice )?(?:X|that many))';

const statsRegex = '(?:\\d+|X)/(?:\\d+|X)';
const colorRegex = `(?:${Object.keys(colorMap).join('|')})`;
const subtypeRegex = '[A-Z][a-z]+(?:-[A-Z][a-z]+)?';
const subtypesRegex = `${subtypeRegex}(?: ${subtypeRegex})*`;
const typeRegex = 'artifact|enchantment';
const abilityRegex = '(?:[a-z]+|"[^"]+")';
const abilitiesRegex = `${abilityRegex}(?: and ${abilityRegex})*`;

const creatureRegex = `${numberRegex}(?: tapped)?(?: (${statsRegex}))? (${colorRegex}) (${subtypesRegex}) (?:(?:${typeRegex}) )?creature tokens?(?: with (${abilitiesRegex}))?`;

const predefinedRegex = `${numberRegex}(?: tapped)? (${predefinedNames.join('|')}|colorless Clue artifact) tokens?`;

const guessRegex = new RegExp(`[Cc]reates? (?:${creatureRegex}|${predefinedRegex})`, 'g');
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
];

export default defineComponent({
    name: 'DataCard',

    components: { ArrayInput, CardImage, CardAvatar },

    setup() {
        const router = useRouter();
        const route = useRoute();
        const magic = useMagic();

        const { controlGet, controlPost } = controlSetup();

        const data = ref<CardData | undefined>(undefined);
        const dataGroup = ref<CardGroup | undefined>(undefined);
        const history = ref<History[]>([]);
        const unlock = ref(false);
        const replaceFrom = ref('');
        const replaceTo = ref('');
        const sample = ref(true);

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

        const dbId = computed(() => data.value?._id);

        const id = computed({
            get() { return data.value?.cardId ?? route.query.id as string; },
            set(newValue: string) {
                if (data.value != null) {
                    data.value.cardId = newValue;
                }
            },
        });

        const lang = computed({
            get() { return data.value?.lang ?? route.query.lang as string; },
            set(newValue: string) { if (data.value != null) { data.value.lang = newValue; } },
        });

        const set = computed(() => data.value?.set ?? route.query.set as string);
        const number = computed(() => data.value?.number ?? route.query.number as string);

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

        const partIndex = computed({
            get() {
                if (data.value?.partIndex != null) {
                    return data.value.partIndex;
                }

                if (route.query.part != null) {
                    return parseInt(route.query.part as string, 10);
                }

                return 0;
            },
            set(newValue: number) {
                if (data.value != null) {
                    data.value.partIndex = newValue;
                }
            },
        });

        const loaded = computed(() => dataGroup.value?.cards.length);
        const total = computed(() => dataGroup.value?.total);

        const layout = computed({
            get() { return data.value?.layout ?? 'normal'; },
            set(newValue: Layout) {
                if (data.value != null) {
                    data.value.layout = newValue;
                }
            },
        });

        const layoutOptions = ['normal', 'split', 'multipart'];
        const partCount = computed(() => data.value?.parts?.length ?? 0);

        const partOptions = computed(() => {
            const result = [];

            for (let i = 0; i < partCount.value; i += 1) {
                result.push({ value: i, label: i.toString() });
            }

            return result;
        });

        const part = computed(() => data?.value?.parts?.[partIndex.value]);

        const partField1 = <F extends keyof Part>(firstKey: F, defaultValue?: Part[F]) => computed({
            get() { return (part.value?.[firstKey] ?? defaultValue)!; },
            set(newValue: Part[F]) {
                if (data.value != null) {
                    part.value![firstKey] = newValue;
                }
            },
        });

        const partField2 = <
            F extends keyof Part,
            L extends keyof Part[F],
        >(firstKey: F, lastKey: L, defaultValue?: Part[F][L]) => computed({
            get(): Part[F][L] {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                return ((part.value as any)?.[firstKey]?.[lastKey] ?? defaultValue)!;
            },
            set(newValue: Part[F][L]) {
                if (data.value != null) {
                    (part.value as any)![firstKey][lastKey] = newValue;
                }
            },
        });

        const oracleName = partField2('oracle', 'name');
        const oracleTypeline = partField2('oracle', 'typeline');
        const oracleText = partField2('oracle', 'text');
        const unifiedName = partField2('unified', 'name');
        const unifiedTypeline = partField2('unified', 'typeline');
        const unifiedText = partField2('unified', 'text');
        const printedName = partField2('printed', 'name');
        const printedTypeline = partField2('printed', 'typeline');
        const printedText = partField2('printed', 'text');

        const flavorText = partField1('flavorText', '');
        const flavorName = partField1('flavorName', '');

        // dev only
        const tag = (name: string) => computed({
            get(): boolean {
                if (data.value == null) {
                    return false;
                }

                return data.value.tags.includes(`dev:${name}`);
            },
            set(newValue: boolean) {
                if (data.value == null) {
                    return;
                }

                if (newValue) {
                    if (!data.value.tags.includes(`dev:${name}`)) {
                        data.value.tags.push(`dev:${name}`);
                    }
                } else {
                    data.value.tags = data.value.tags.filter(v => v !== `dev:${name}`);
                }
            },
        });

        const localTag = (name: string) => computed({
            get(): boolean {
                if (data.value == null) {
                    return false;
                }

                return data.value.localTags.includes(`dev:${name}`);
            },
            set(newValue: boolean) {
                if (data.value == null) {
                    return;
                }

                if (newValue) {
                    if (!data.value.localTags.includes(`dev:${name}`)) {
                        data.value.localTags.push(`dev:${name}`);
                    }
                } else {
                    data.value.localTags = data.value.localTags.filter(v => v !== `dev:${name}`);
                }
            },
        });

        const devPrinted = localTag('printed');
        const devToken = tag('token');
        const devCounter = tag('counter');

        const relatedCards = computed({
            get() {
                return data.value?.relatedCards ?? [];
            },
            set(newValue: CardData['relatedCards']) {
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
                    // eslint-disable-next-line prefer-const, @typescript-eslint/no-shadow
                    let [relation, cardId, lang, set, number] = p.split('|');

                    if (relation.length === 1) {
                        relation = {
                            t: 'token',
                            e: 'emblem',
                            i: 'intext',
                            s: 'specialization',
                        }[relation] ?? relation;
                    }

                    if (relation === 'emblem' && cardId == null) {
                        cardId = `${id.value}_emblem`;
                    }

                    cardId = deburr(cardId)
                        .trim()
                        .toLowerCase()
                        .replace(/[^a-z0-9!*]/g, '_');

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
            get() { return data.value?.counters ?? []; },
            set(newValue: string[]) {
                if (data.value == null) {
                    return;
                }

                newValue = uniq(newValue);

                devCounter.value = false;

                if (newValue.length === 0) {
                    delete data.value?.counters;
                } else {
                    data.value.counters = newValue.sort();
                }
            },
        });

        const multiverseId = computed({
            get() { return data.value?.multiverseId ?? []; },
            set(newValue: number[]) {
                if (data.value != null) {
                    data.value.multiverseId = newValue;
                }
            },
        });

        const showBeforeUpdate = ref(false);

        const oracleUpdated = computed(() => {
            if (data.value == null) {
                return undefined;
            }

            const value = data.value?.__oracle;

            if (value == null) {
                return undefined;
            }

            if (value.name == null && value.typeline == null && value.text == null) {
                return undefined;
            }

            return value;
        });

        const displayOracleName = computed({
            get(): string {
                if (showBeforeUpdate.value) {
                    return oracleUpdated.value?.name ?? oracleName.value;
                } else {
                    return oracleName.value;
                }
            },
            set(newValue: string) {
                if (!showBeforeUpdate.value) {
                    oracleName.value = newValue;
                }
            },
        });

        const displayOracleTypeline = computed({
            get(): string {
                if (showBeforeUpdate.value) {
                    return oracleUpdated.value?.typeline ?? oracleTypeline.value;
                } else {
                    return oracleTypeline.value;
                }
            },
            set(newValue: string) {
                if (!showBeforeUpdate.value) {
                    oracleTypeline.value = newValue;
                }
            },
        });

        const displayOracleText = computed({
            get(): string | undefined {
                if (showBeforeUpdate.value) {
                    return oracleUpdated.value?.text ?? oracleText.value;
                } else {
                    return oracleText.value;
                }
            },
            set(newValue: string | undefined) {
                if (!showBeforeUpdate.value) {
                    oracleText.value = newValue;
                }
            },
        });

        const defaultPrettify = () => {
            if (data.value == null) {
                return;
            }

            unifiedTypeline.value = unifiedTypeline.value
                .replace(/ *～ *-? */, '～')
                .replace(/ *― *-? */, '―')
                .replace(/ *: *-? */, ' : ');

            printedTypeline.value = printedTypeline.value
                .replace(/ *～ *-? */, '～')
                .replace(/ *― *-? */, '―')
                .replace(/ *: *-? */, ' : ');

            unifiedText.value = unifiedText.value!.replace(/~~/g, unifiedName.value);
            printedText.value = printedText.value!.replace(/~~/g, printedName.value);

            if (lang.value === 'zhs' || lang.value === 'zht') {
                unifiedTypeline.value = unifiedTypeline.value.replace(/~/g, '～').replace(/\//g, '／');
                printedTypeline.value = printedTypeline.value.replace(/~/g, '～').replace(/\//g, '／');
                unifiedText.value = unifiedText.value.replace(/~/g, '～').replace(/\/\//g, '／').trim();
                printedText.value = printedText.value.replace(/~/g, '～').replace(/\/\//g, '／').trim();

                if (flavorText.value != null) {
                    flavorText.value = flavorText.value
                        .replace(/~/g, '～')
                        .replace(/\.\.\./g, '…')
                        .replace(/」 ?～/g, '」\n～')
                        .replace(/。 ?～/g, '。\n～')
                        .replace(/([，。！？：；]) /g, (m, m1: string) => m1);
                }
            } else {
                unifiedTypeline.value = unifiedTypeline.value.replace(/ - /g, ' — ').trim();
                printedTypeline.value = printedTypeline.value.replace(/ - /g, ' — ').trim();
            }

            unifiedText.value = unifiedText.value.trim().replace(/[●•] ?/g, '• ').replace(/<\/?.>/g, '');
            printedText.value = printedText.value.trim().replace(/[●•] ?/g, '• ').replace(/<\/?.>/g, '');

            if (lang.value === 'zhs' || lang.value === 'zht') {
                if (!/[a-wyz](?![/}])/.test(unifiedText.value)) {
                    unifiedText.value = unifiedText.value
                        // .replace(/(?<!•)(?<!\d-\d)(?<!\d\+)(?<!—) (?!—|II)/g, '')
                        .replace(/\(/g, '（')
                        .replace(/\)/g, '）')
                        .replace(/;/g, '；');
                }

                if (!/[a-wyz](?![/}])/.test(printedText.value)) {
                    printedText.value = printedText.value
                        // .replace(/(?<!•)(?<!\d-\d)(?<!\d\+)(?<!—) (?!—|II)/g, '')
                        .replace(/<\/?.>/g, '')
                        .replace(/\(/g, '（')
                        .replace(/\)/g, '）')
                        .replace(/;/g, '；');
                }
            }
        };

        const prettify = () => {
            if (data.value == null) {
                return;
            }

            if (lang.value !== 'en') {
                if (oracleName.value !== unifiedName.value && oracleName.value === printedName.value) {
                    printedName.value = unifiedName.value;
                }

                if (oracleName.value !== printedName.value && oracleName.value === unifiedName.value) {
                    unifiedName.value = printedName.value;
                }

                if (oracleTypeline.value !== unifiedTypeline.value && oracleTypeline.value === printedTypeline.value) {
                    printedTypeline.value = unifiedTypeline.value;
                }

                if (oracleTypeline.value !== printedTypeline.value && oracleTypeline.value === unifiedTypeline.value) {
                    unifiedTypeline.value = printedTypeline.value;
                }

                if (oracleText.value !== unifiedText.value && oracleText.value === printedText.value) {
                    printedText.value = unifiedText.value;
                }

                if (oracleText.value !== printedText.value && oracleText.value === unifiedText.value) {
                    unifiedText.value = printedText.value;
                }
            }

            defaultPrettify();

            if (replaceFrom.value !== '') {
                unifiedText.value = unifiedText.value!.replace(
                    new RegExp(escapeRegExp(replaceFrom.value), 'g'),
                    replaceTo.value,
                );
                unifiedTypeline.value = unifiedTypeline.value.replace(
                    new RegExp(escapeRegExp(replaceFrom.value), 'g'),
                    replaceTo.value,
                );
            }

            unifiedText.value = unifiedText.value!.replace(/ *[(（][^)）]+[)）] */g, '').trim();

            if (/^\((Theme color: (\{.\})+|\{T\}: Add \{.\}\.)\)$/.test(printedText.value!)) {
                printedText.value = '';
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
            const { data: legalities } = await controlGet('/magic/card/get-legality', {
                id: id.value,
            });

            console.log(legalities);
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

        const newData = () => {
            if (data.value == null) {
                return;
            }

            delete data.value._id;

            for (const p of data.value.parts) {
                delete p.scryfallIllusId;
            }

            delete data.value.scryfall.cardId;
            data.value.scryfall.imageUris = [];
            delete data.value.arenaId;
            delete data.value.mtgoId;
            delete data.value.mtgoFoilId;
            data.value.multiverseId = [];
            delete data.value.tcgPlayerId;
            delete data.value.cardMarketId;

            unlock.value = true;
        };

        const doUpdate = debounce(
            async () => {
                if (data.value == null) {
                    return;
                }

                defaultPrettify();

                history.value.unshift({
                    id:     id.value,
                    set:    set.value,
                    number: number.value,
                    lang:   lang.value,
                });

                await controlPost('/magic/card/update', {
                    data: data.value,
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
                const { data: result } = await controlGet<Card>('/magic/card/raw', {
                    id:     id.value,
                    lang:   lang.value,
                    set:    set.value,
                    number: number.value,
                });

                data.value = result;
            }
        };

        const loadGroup = async (method: string) => {
            if (data.value != null) {
                await doUpdate();
            }

            if (dataGroup.value != null && dataGroup.value.method === method && dataGroup.value.cards.length > 0) {
                data.value = dataGroup.value.cards.shift();
                dataGroup.value.total -= 1;
                return;
            }

            let request: AxiosResponse<CardGroup>;

            const sampleValue = sample.value ? 20 : 1;

            if (method.startsWith('search:')) {
                request = await controlGet<CardGroup>('/magic/card/search', {
                    q:      search.value,
                    sample: sampleValue,
                });
            } else {
                request = await controlGet<CardGroup>('/magic/card/need-edit', {
                    method,
                    lang:   magic.locale,
                    sample: sampleValue,
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

        watch(sample, () => { dataGroup.value = undefined; });

        const doSearch = async () => {
            if (search.value === '') {
                return;
            }

            loadGroup(`search:${search.value}`);
        };

        onMounted(loadData);

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

            for (const text of data.value.parts.map(p => p.oracle.text ?? '')) {
                for (const m of text.matchAll(guessRegex)) {
                    let tokenId = '';

                    const mp = predefinedCheckRegex.exec(m[0]);

                    if (mp != null) {
                        if (mp[1] === 'colorless Clue artifact') {
                            tokenId = 'clue!';
                        } else {
                            tokenId = `${mp[1].toLowerCase()}!`;
                        }
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

                if (/^(Embalm|Eternalize)/m.test(text)) {
                    relatedCardsCopy.push({ relation: 'token', cardId: `${id.value}!` });
                }
            }

            relatedCards.value = relatedCardsCopy;
        };

        const guessCounter = () => {
            if (data.value == null) {
                return;
            }

            for (const text of data.value.parts.map(p => p.oracle.text ?? '')) {
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

        const loadGatherer = async () => {
            if (data.value == null) {
                return;
            }

            await controlGet('/magic/card/parse-gatherer', {
                id:     multiverseId.value.join(','),
                set:    set.value,
                number: number.value,
                lang:   lang.value,
            });
        };

        return {
            data,
            dataGroup,
            loaded,
            total,

            history,
            unlock,
            replaceFrom,
            replaceTo,
            search,
            sample,

            partCount,
            partIndex,

            dbId,
            id,
            lang,
            set,
            number,
            info,
            cardLink,
            layout,
            oracleName,
            oracleTypeline,
            oracleText,
            oracleUpdated,
            showBeforeUpdate,
            displayOracleName,
            displayOracleTypeline,
            displayOracleText,
            unifiedName,
            unifiedTypeline,
            unifiedText,
            printedName,
            printedTypeline,
            printedText,
            flavorText,
            flavorName,
            relatedCardsString,
            counters,
            multiverseId,

            layoutOptions,
            partOptions,

            newData,
            doUpdate,
            loadGatherer,
            prettify,
            overwriteUnified,
            getLegality,
            extractRulingCards,
            loadData,
            loadGroup,
            doSearch,

            devPrinted,
            devToken,
            devCounter,
            guessToken,
            guessCounter,
        };
    },
});
</script>
