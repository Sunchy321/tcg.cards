<template>
    <div class="q-pa-md row">
        <div class="card-image col-3 q-mr-md">
            <card-image
                v-if="hasData"
                v-model:part="partIndex"
                :lang="lang"
                :set="set"
                :number="number"
                :layout="layout"
            />
            <div class="history q-mt-md">
                <div class="code text-center">{{ history.length }}</div>
                <div
                    v-for="h in history.slice(0, 5)"
                    :key="`${h.id}|${h.set}|${h.number}|${h.lang}`"
                    class="flex justify-center"
                >
                    <card-avatar :id="h.id" :version="h" />
                </div>
            </div>
        </div>
        <div class="col q-gutter-sm">
            <div class="q-mb-md">
                <q-input v-model="search" class="q-mr-md" dense @keypress.enter="doSearch">
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
                    <q-btn outline label="oracle" @click="loadData('inconsistent-oracle')" />
                    <q-btn outline label="unified" @click="loadData('inconsistent-unified')" />
                    <q-btn outline label="paren" @click="loadData('parentheses')" />
                    <q-btn outline label="token" @click="loadData('token')" />
                </q-btn-group>

                <span v-if="total != null" class="q-ml-md">{{ total }}</span>

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

                <div class="col-grow" />

                <q-btn
                    v-if="enPrinted"
                    color="red" icon="mdi-alert-circle-outline"
                    dense flat round
                    @click="enPrinted = false"
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
                <q-btn icon="mdi-book" dense flat round @click="extractRulingCards" />
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

            <q-input v-model="flavorText" autogrow label="Flavor Text" outlined type="textarea" />
            <q-input v-model="flavorName" label="Flavor Name" outlined dense />

            <div class="flex items-center">
                <q-input
                    v-model="relatedCards"
                    class="col-grow"
                    debounce="500"
                    label="Related Cards"
                    outlined dense
                />
                <q-btn
                    icon="mdi-card-plus-outline"
                    class="q-ml-sm"
                    flat dense round
                    @click="guessToken"
                />
            </div>

            <div class="flex items-center">
                <array-input
                    v-model="multiverseId"
                    class="col-grow"
                    label="Multiverse ID"
                    is-number
                    outlined dense
                />

                <q-btn
                    icon="mdi-magnify"
                    class="q-ml-sm"
                    flat dense round
                    @click="loadGatherer"
                />
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
import CardAvatar from '../CardAvatar.vue';

import { Card, Layout } from 'interface/magic/card';

import { debounce, deburr, escapeRegExp } from 'lodash';

type Part = Card['parts'][0];

type CardData = Card & {
    _id?: string;
    __tags?: {
        oracleUpdated?: {
            name?: string;
            typeline?: string;
            text?: string;
        };
    };
    partIndex?: number;
    total?: number;
    result?: {
        _id: { id: string, lang: string, part: number };
    };
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

const predefinedNames = ['Gold', 'Clue', 'Treasure', 'Food', 'Walker', 'Shard', 'Blood'];

const numberRegex = '(?:[a-z]+|a number of|(?:twice )?(?:X|that many))';

const statsRegex = '(?:\\d+|X)/(?:\\d+|X)';
const colorRegex = `(?:${Object.keys(colorMap).join('|')})`;
const subtypeRegex = '[A-Z][a-z]+(?:-[A-Z][a-z]+)?';
const subtypesRegex = `${subtypeRegex}(?: ${subtypeRegex})*`;
const typeRegex = 'artifact|enchantment';
const abilityRegex = '(?:[a-z]+|"[^"]+")';
const abilitiesRegex = `${abilityRegex}(?: and ${abilityRegex})*`;

const creatureRegex = `${numberRegex}(?: tapped)?(?: (${statsRegex}))? (${colorRegex}) (${subtypesRegex}) (?:(?:${typeRegex}) )?creature tokens?(?: with (${abilitiesRegex}))?`;

const predefinedRegex = `${numberRegex} (${predefinedNames.join('|')}|colorless Clue artifact) tokens?`;

const guessRegex = new RegExp(`[Cc]reates? (?:${creatureRegex}|${predefinedRegex})`, 'g');
const predefinedCheckRegex = new RegExp(predefinedRegex);

export default defineComponent({
    name: 'DataCard',

    components: { ArrayInput, CardImage, CardAvatar },

    setup() {
        const router = useRouter();
        const route = useRoute();
        const magic = useMagic();

        const { controlGet, controlPost } = controlSetup();

        const data = ref<CardData | null>(null);
        const history = ref<History[]>([]);
        const unlock = ref(false);
        const replaceFrom = ref('');
        const replaceTo = ref('');

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

        const hasData = computed(() => {
            if (data.value == null) {
                return false;
            }

            const keys = Object.keys(data.value);

            if (keys.length === 1 && keys[0] === 'total' && data.value.total === 0) {
                return false;
            }

            return true;
        });

        const dbId = computed(() => data.value?._id);

        const id = computed({
            get() { return data.value?.cardId ?? route.query.id as string; },
            set(newValue: string) {
                if (hasData.value) {
                    data.value!.cardId = newValue;
                }
            },
        });

        const lang = computed({
            get() { return data.value?.lang ?? route.query.lang as string; },
            set(newValue: string) { if (hasData.value) { data.value!.lang = newValue; } },
        });

        const set = computed(() => data.value?.set ?? route.query.set as string);
        const number = computed(() => data.value?.number ?? route.query.number as string);

        const info = computed(() => {
            if (hasData.value) {
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
                if (hasData.value) {
                    data.value!.partIndex = newValue;
                }
            },
        });

        const total = computed(() => data.value?.total);

        const layout = computed({
            get() { return data.value?.layout ?? 'normal'; },
            set(newValue: Layout) {
                if (hasData.value) {
                    data.value!.layout = newValue;
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
                if (hasData.value) {
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
                if (hasData.value) {
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

        const relatedCards = computed({
            get() {
                return data.value?.relatedCards
                    ?.map(
                        ({ relation, cardId, version }) => (version != null
                            ? [relation, cardId, version.lang, version.set, version.number]
                            : [relation, cardId]
                        ).join('|'),
                    )
                    ?.join('; ') ?? '';
            },
            set(newValue: string) {
                if (!hasData.value) {
                    return;
                }

                if (newValue === '') {
                    data.value!.relatedCards = [];
                    return;
                }

                const parts = newValue.split(/; */);

                data.value!.relatedCards = parts.map(p => {
                    // eslint-disable-next-line prefer-const, @typescript-eslint/no-shadow
                    let [relation, cardId, lang, set, number] = p.split('|');

                    if (relation.length === 1) {
                        relation = {
                            t: 'token',
                            e: 'emblem',
                            i: 'intext',
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
            if (!hasData.value) {
                return undefined;
            }

            const value = data.value?.__tags?.oracleUpdated;

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
            if (!hasData.value) {
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
            if (!hasData.value) {
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

        const extractRulingCards = async () => {
            const { data: cards } = await controlGet('/magic/card/extract-ruling-cards', {
                id: id.value,
            });

            console.log(cards);
        };

        const guessToken = () => {
            if (data.value == null) {
                return;
            }

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

                    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                    if (data.value.relatedCards.every(r => r.cardId !== tokenId)) {
                        data.value.relatedCards.push({
                            relation: 'token',
                            cardId:   tokenId,
                        });
                    }
                }
            }
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

        const loadGatherer = async () => {
            if (!hasData.value) {
                return;
            }

            await controlGet('/magic/card/parse-gatherer', {
                id:     multiverseId.value.join(','),
                set:    set.value,
                number: number.value,
                lang:   lang.value,
            });
        };

        const doUpdate = debounce(
            async () => {
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

        const loadData = async (editType?: string, update = true) => {
            if (editType != null) {
                if (hasData.value && update) {
                    await doUpdate();
                }

                const { data: result } = await controlGet<Card>('/magic/card/need-edit', {
                    type: editType,
                    lang: magic.locale,
                });

                if (result != null) {
                    data.value = result;
                } else {
                    data.value = null;
                }
            } else if (id.value != null && lang.value != null && set.value != null && number.value != null) {
                const { data: result } = await controlGet<Card>('/magic/card/raw', {
                    id:     id.value,
                    lang:   lang.value,
                    set:    set.value,
                    number: number.value,
                });

                data.value = result;
            }
        };

        const doSearch = async () => {
            if (hasData.value && id.value != null) {
                await doUpdate();
            }

            const { data: result } = await controlGet<{ result: Card }>('/magic/card/search', { q: search.value });

            if (partIndex.value !== 0) {
                partIndex.value = 0;
            }

            data.value = result.result;
        };

        onMounted(loadData);

        // dev only
        const enPrinted = computed({
            get(): boolean {
                if (data.value == null) {
                    return false;
                }

                const devData = data.value as any;

                if (devData?.__tags?.printed as boolean | undefined) {
                    return true;
                } else {
                    return false;
                }
            },
            set(newValue: boolean) {
                if (data.value == null) {
                    return;
                }

                const devData = data.value as any;

                if (newValue) {
                    if (devData.__tags == null) {
                        devData.__tags = { printed: true };
                    } else {
                        devData.__tags.printed = true;
                    }
                } else if (devData.__tags != null) {
                    delete devData.__tags.printed;
                }
            },
        });

        watch(
            [data, partIndex, printedName, printedTypeline, printedText],
            ([newValue, newIndex], [oldValue, oldIndex]) => {
                if (newValue === oldValue && newIndex === oldIndex) {
                    enPrinted.value = false;
                }
            },
        );

        return {
            hasData,

            history,
            unlock,
            replaceFrom,
            replaceTo,
            search,

            partCount,
            partIndex,
            total,

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
            relatedCards,
            multiverseId,

            layoutOptions,
            partOptions,

            newData,
            doUpdate,
            loadGatherer,
            prettify,
            overwriteUnified,
            extractRulingCards,
            guessToken,
            loadData,
            doSearch,

            enPrinted,
        };
    },
});
</script>
