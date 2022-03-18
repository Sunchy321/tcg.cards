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
            <div class="q-mb-md">
                <q-btn-group outline>
                    <q-btn outline label="oracle" @click="loadData('inconsistent-oracle')" />
                    <q-btn outline label="unified" @click="loadData('inconsistent-unified')" />
                    <q-btn outline label="paren" @click="loadData('parentheses')" />
                    <q-btn outline label="token" @click="loadData('token')" />
                </q-btn-group>

                <span v-if="total != null" class="q-ml-md">{{ total }}
                </span>

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

            <div class="id-line row items-center">
                <div class="db-id code q-mr-md">{{ dbId == null ? 'null' : 'id' }}</div>

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

                <q-select v-model="layout" class="q-mr-md" :options="layoutOptions" dense />
                <q-btn-toggle v-model="partIndex" class="q-mr-md" :options="partOptions" outline dense />

                <q-btn
                    v-if="enPrinted"
                    color="red" icon="mdi-alert-circle-outline"
                    dense flat round
                    @click="enPrinted = false"
                />

                <div class="col-grow" />

                <q-btn label="New" dense flat @click="newData" />
                <q-btn :icon="unlock ? 'mdi-lock-open' : 'mdi-lock'" dense flat round @click="unlock = !unlock" />
                <q-btn v-if="lang == 'en'" icon="mdi-arrow-down-bold" dense flat round @click="overwriteUnified" />
                <q-btn icon="mdi-upload" dense flat round @click="doUpdate" />
            </div>

            <table>
                <tr>
                    <td class="title">
                        Oracle
                    </td>
                    <td class="name">
                        <q-input v-model="oracleName" :readonly="!unlock" outlined dense />
                    </td>
                    <td class="typeline">
                        <q-input v-model="oracleTypeline" :readonly="!unlock" outlined dense />
                    </td>
                    <td class="text">
                        <q-input v-model="oracleText" :readonly="!unlock" outlined type="textarea" dense />
                    </td>
                </tr>
                <tr>
                    <td class="title">
                        Unified
                    </td>
                    <td class="name">
                        <q-input v-model="unifiedName" outlined dense />
                    </td>
                    <td class="typeline">
                        <q-input v-model="unifiedTypeline" outlined dense />
                    </td>
                    <td class="text">
                        <q-input v-model="unifiedText" outlined type="textarea" dense />
                    </td>
                </tr>
                <tr>
                    <td class="title">
                        Printed
                    </td>
                    <td class="name">
                        <q-input v-model="printedName" outlined dense />
                    </td>
                    <td class="typeline">
                        <q-input v-model="printedTypeline" outlined dense />
                    </td>
                    <td class="text">
                        <q-input v-model="printedText" outlined type="textarea" dense />
                    </td>
                </tr>
            </table>

            <q-input v-model="flavorText" autogrow label="Flavor Text" outlined type="textarea" />
            <q-input v-model="flavorName" label="Flavor Name" outlined dense />

            <q-input
                v-model="relatedCards"
                debounce="500"
                label="Related Cards"
                outlined dense
            />

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

    & .title
        width: 50px

    & .name
        width: 150px

    & .typeline
        width: 250px

@media screen and (max-width: 1000px)
    .card-image
        display: none

</style>

<script lang="ts">
import {
    defineComponent, ref, computed, onMounted, watch,
} from 'vue';

import { useRouter, useRoute } from 'vue-router';
import { useStore } from 'src/store';

import controlSetup from 'setup/control';

import ArrayInput from 'components/ArrayInput.vue';
import CardImage from 'components/magic/CardImage.vue';

import { Card, Layout } from 'interface/magic/card';

import { escapeRegExp } from 'lodash';

type Part = Card['parts'][0];

type CardData = Card & {
    _id?: string;
    partIndex?: number;
    total?: number;
    result?: {
        _id: { id: string, lang: string, part: number };
    };
};

export default defineComponent({
    name: 'DataCard',

    components: { ArrayInput, CardImage },

    setup() {
        const router = useRouter();
        const route = useRoute();
        const store = useStore();

        const { controlGet, controlPost } = controlSetup();

        const data = ref<CardData | null>(null);
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
                    ?.join(', ') ?? '';
            },
            set(newValue: string) {
                const parts = newValue.split(/, */);

                if (hasData.value) {
                    data.value!.relatedCards = parts.map(p => {
                        // eslint-disable-next-line @typescript-eslint/no-shadow
                        const [relation, cardId, lang, set, number] = p.split('|');

                        if (lang != null) {
                            return { relation, cardId, version: { lang, set, number } };
                        } else {
                            return { relation, cardId };
                        }
                    });
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
                        .replace(/(?<!\.)\.\.\.(?!\.)/g, '…')
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
                        .replace(/(?<!•)(?<!\d-\d)(?<!\d\+)(?<!—) (?!—|II)/g, '')
                        .replace(/\(/g, '（')
                        .replace(/\)/g, '）')
                        .replace(/;/g, '；');
                }

                if (!/[a-wyz](?![/}])/.test(printedText.value)) {
                    printedText.value = printedText.value
                        .replace(/(?<!•)(?<!\d-\d)(?<!\d\+)(?<!—) (?!—|II)/g, '')
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

        const doUpdate = async () => {
            defaultPrettify();

            console.log(data.value?.cardId);

            await controlPost('/magic/card/update', {
                data: data.value,
            });
        };

        const loadData = async (editType?: string, update = true) => {
            if (editType != null) {
                if (hasData.value && update) {
                    await doUpdate();
                }

                const { data: result } = await controlGet<Card>('/magic/card/need-edit', {
                    type: editType,
                    lang: store.getters['magic/locale'],
                });

                if (result != null) {
                    data.value = result;
                } else {
                    data.value = null;
                }
            } else if (id.value && lang.value && set.value && number.value) {
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
            [data, printedName, printedTypeline, printedText],
            ([newValue], [oldValue]) => {
                if (newValue === oldValue) {
                    enPrinted.value = false;
                }
            },
        );

        return {
            hasData,

            unlock,
            replaceFrom,
            replaceTo,
            search,

            partIndex,
            total,

            dbId,
            id,
            lang,
            set,
            number,
            info,
            layout,
            oracleName,
            oracleTypeline,
            oracleText,
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
            loadData,
            doSearch,

            enPrinted,
        };
    },
});
</script>
