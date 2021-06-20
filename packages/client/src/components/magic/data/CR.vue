<template>
    <div class="q-pa-md">
        <div class="buttons row items-center q-gutter-md">
            <q-select
                v-model="date"
                dense outlined
                emit-value map-options
                :options="crOptions"
            >
                <template #option="scope">
                    <q-item
                        v-bind="scope.itemProps"
                        v-on="scope.itemEvents"
                    >
                        <q-item-section avatar>
                            <q-icon
                                :color="scope.opt.hasData ? 'positive' : 'grey'"
                                :name="scope.opt.hasData ? 'mdi-check' : 'mdi-help'"
                            />
                        </q-item-section>
                        <q-item-section>{{ scope.opt.value }}</q-item-section>
                    </q-item>
                </template>
            </q-select>

            <q-btn
                v-if="!cr.includes(date)"
                label="Parse"
                dense outline
                @click="parse"
            />

            <q-btn
                v-else
                label="Load"
                dense outline
                @click="loadData"
            />

            <q-btn
                label="Save"
                dense outline
                @click="save"
            />

            <q-btn
                v-if="cr.includes(date)"
                label="Reparse"
                dense outline
                @click="reparse"
            />

            <span v-if="duplicatedID.length > 0" class="error">Duplicated ID {{ duplicatedID.join(', ') }}</span>

            <div class="col-grow" />

            <q-tabs v-model="tab" dense>
                <q-tab name="content" label="Content" />
                <q-tab name="glossary" label="Glossary" />
            </q-tabs>
        </div>

        <q-tab-panels v-model="tab" animated>
            <q-tab-panel name="content">
                <q-table
                    style="height: 500px"
                    :title="contentTitle"
                    :rows="contents"
                    :columns="contentColumns"
                    row-key="id"
                    virtual-scroll
                    :pagination="{ rowsPerPage: 0 }"
                    :filter="contentFilter"
                    :rows-per-page-options="[0]"
                >
                    <template #top-right>
                        <q-input v-model="contentFilter" borderless dense debounce="300">
                            <template #append>
                                <q-icon name="mdi-magnify" />
                            </template>
                        </q-input>
                    </template>

                    <template #body="props">
                        <q-tr :props="props">
                            <q-td key="id" :props="props" style="width: 100px; white-space: normal;">
                                {{ props.row.id }}
                                <q-popup-edit v-model="props.row.id">
                                    <deferred-input
                                        v-model="props.row.id"
                                        dense
                                        autofocus counter
                                        @focus="focus"
                                    />
                                </q-popup-edit>
                            </q-td>
                            <q-td key="depth" :props="props">
                                {{ props.row.depth }}
                            </q-td>
                            <q-td key="index" :props="props">
                                {{ props.row.index }}
                            </q-td>
                            <q-td key="text" :props="props" style="white-space: normal;">
                                <div class="scroll" style="max-height: 120px;">
                                    {{ props.row.text }}
                                </div>
                            </q-td>
                        </q-tr>
                    </template>
                </q-table>
            </q-tab-panel>
            <q-tab-panel name="glossary">
                <q-table
                    style="height: 500px"
                    :title="glossaryTitle"
                    :rows="glossary"
                    :columns="glossaryColumns"
                    row-key="id"
                    virtual-scroll
                    :pagination="{ rowsPerPage: 0 }"
                    :filter="glossaryFilter"
                    :rows-per-page-options="[0]"
                >
                    <template #top-right>
                        <q-input v-model="glossaryFilter" borderless dense debounce="300">
                            <template #append>
                                <q-icon name="mdi-magnify" />
                            </template>
                        </q-input>
                    </template>

                    <template #body="props">
                        <q-tr :props="props">
                            <q-td key="ids" :props="props" style="width: 100px; white-space: normal;">
                                {{ props.row.ids.join(', ') }}
                                <q-popup-edit v-model="props.row.ids">
                                    <array-input
                                        v-model="props.row.ids"
                                        dense autofocus counter
                                        @focus="focus"
                                    />
                                </q-popup-edit>
                            </q-td>
                            <q-td key="words" :props="props" style="width: 100px; white-space: normal;">
                                {{ props.row.words.join(', ') }}
                                <q-popup-edit v-model="props.row.words">
                                    <array-input
                                        v-model="props.row.words"
                                        dense
                                        autofocus counter
                                        @focus="focus"
                                    />
                                </q-popup-edit>
                            </q-td>
                            <q-td key="text" :props="props" style="white-space: normal;">
                                <div class="scroll" style="max-height: 120px;">
                                    {{ props.row.text }}
                                </div>
                            </q-td>
                        </q-tr>
                    </template>
                </q-table>
            </q-tab-panel>
        </q-tab-panels>
    </div>
</template>

<style lang="sass" scoped>
.error
    color: $negative
</style>

<script lang="ts">
import { defineComponent, ref, computed, watch, onMounted } from 'vue';

import { useRouter, useRoute } from 'vue-router';

import controlSetup from 'setup/control';

import DeferredInput from 'components/DeferredInput.vue';
import ArrayInput from 'components/ArrayInput.vue';

import { last } from 'lodash';

import { apiGet } from 'src/boot/backend';

interface CRContent {
    id: string;
    depth: number;
    index: string;
    text: string;
    examples?: string[];
    cards?: { text:string, id:string }[]
}

interface CRGlossary {
    words: string[];
    ids: string[];
    text: string;
}

interface CR {
    date: string;
    intro: string;
    contents: CRContent[];
    glossary: CRGlossary[];
    credits: string;
    csi?: string;
}

export default defineComponent({
    name: 'DataCR',

    components: { ArrayInput, DeferredInput },

    setup() {
        const router = useRouter();
        const route = useRoute();

        const { controlGet, controlPost } = controlSetup();

        const cr = ref<string[]>([]);
        const txt = ref<string[]>([]);
        const data = ref<CR|null>(null);
        const tab = ref('content');

        const contentFilter = ref('');
        const glossaryFilter = ref('');

        const date = computed({
            get() {
                return route.query.date as string ?? last(cr.value);
            },
            set(newValue: string) {
                void router.push({ query: { ...route.query, date: newValue } });
            },
        });

        const crOptions = computed(() => {
            return txt.value.map(d => ({
                value:   d,
                label:   d,
                hasData: cr.value.includes(d),
            }));
        });

        const contents = computed(() => { return data.value?.contents ?? []; });
        const glossary = computed(() => { return data.value?.glossary ?? []; });

        const contentTitle = computed(() => {
            if (data.value != null) {
                return `Contents (${data.value.date})`;
            } else {
                return 'Contents';
            }
        });

        const contentColumns = [
            { name: 'id', label: 'ID', field: 'id' },
            { name: 'depth', label: 'Depth', field: 'depth' },
            { name: 'index', label: 'Index', field: 'index' },
            { name: 'text', label: 'Text', field: 'text', align: 'left' },
        ];

        const duplicatedID = computed(() => {
            const ids = contents.value.map(c => c.id);

            const count: Record<string, number> = { };

            for (const id of ids) {
                count[id] = (count[id] ?? 0) + 1;
            }

            return Object.keys(count).filter(id => count[id] > 1);
        });

        const glossaryTitle = computed(() => {
            if (data.value != null) {
                return `Glossary (${data.value.date})`;
            } else {
                return 'Glossary';
            }
        });

        const glossaryColumns = [
            { name: 'ids', label: 'IDs', field: 'ids' },
            { name: 'words', label: 'Words', field: 'words' },
            { name: 'text', label: 'Text', field: 'text', align: 'left' },
        ];

        const loadData = async () => {
            if (date.value != null && cr.value.includes(date.value)) {
                const { data: result } = await apiGet<CR>('/magic/cr', {
                    date: date.value,
                });

                data.value = result;
            }
        };

        const loadList = async () => {
            const { data: crResult } = await apiGet<string[]>('/magic/cr');
            const { data: txtResult } = await controlGet<string[]>('/magic/cr/list');

            cr.value = crResult;
            txt.value = txtResult;

            if (data.value == null) {
                void loadData();
            }
        };

        const parse = async () => {
            if (date.value != null && !cr.value.includes(date.value)) {
                const { data:result } = await controlGet<CR>('/magic/cr/parse', { date: date.value });

                data.value = result;
            }
        };

        const save = async () => {
            if (data.value != null) {
                await controlPost('/magic/cr/save', { data: data.value });

                void loadList();
            }
        };

        const reparse = async () => {
            if (date.value != null && cr.value.includes(date.value)) {
                const { data: result } = await controlGet<CR>('/magic/cr/reparse', { date: date.value });

                data.value = result;
            }
        };

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const focus = (e: any) => { e.target.select(); };

        watch(date, loadData);
        onMounted(loadList);

        return {
            date,
            cr,
            tab,
            contentFilter,

            contents,
            contentTitle,
            contentColumns,
            glossary,
            glossaryTitle,
            glossaryColumns,
            glossaryFilter,

            duplicatedID,

            crOptions,

            loadData,
            save,
            parse,
            reparse,

            focus,
        };
    },
});
</script>
