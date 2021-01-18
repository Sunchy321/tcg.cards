<template>
    <div class="q-pa-md">
        <div class="buttons row items-center q-gutter-md">
            <q-select
                v-model="date"
                dense outlined
                emit-value map-options
                :options="crOptions"
            >
                <template v-slot:option="scope">
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
                    :data="contents"
                    :columns="contentColumns"
                    row-key="id"
                    virtual-scroll
                    :pagination="{ rowsPerPage: 0 }"
                    :filter="contentFilter"
                    :rows-per-page-options="[0]"
                >
                    <template v-slot:top-right>
                        <q-input v-model="contentFilter" borderless dense debounce="300">
                            <template v-slot:append>
                                <q-icon name="mdi-magnify" />
                            </template>
                        </q-input>
                    </template>

                    <template v-slot:body="props">
                        <q-tr :props="props">
                            <q-td key="id" :props="props" style="width: 100px; white-space: normal;">
                                {{ props.row.id }}
                                <q-popup-edit v-model="props.row.id">
                                    <q-input
                                        :value="props.row.id"
                                        dense
                                        autofocus counter
                                        @focus="e => e.target.select()"
                                        @change="e => props.row.id = e.target.value"
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
                    :data="glossary"
                    :columns="glossaryColumns"
                    row-key="id"
                    virtual-scroll
                    :pagination="{ rowsPerPage: 0 }"
                    :filter="glossaryFilter"
                    :rows-per-page-options="[0]"
                >
                    <template v-slot:top-right>
                        <q-input v-model="glossaryFilter" borderless dense debounce="300">
                            <template v-slot:append>
                                <q-icon name="mdi-magnify" />
                            </template>
                        </q-input>
                    </template>

                    <template v-slot:body="props">
                        <q-tr :props="props">
                            <q-td key="ids" :props="props" style="width: 100px; white-space: normal;">
                                {{ props.row.ids.join(', ') }}
                                <q-popup-edit
                                    :value="props.row.ids.join(', ')"
                                    @input="v => props.row.ids = v.split(', ')"
                                >
                                    <q-input
                                        :value="props.row.ids.join(', ')"
                                        dense
                                        autofocus counter
                                        @focus="e => e.target.select()"
                                        @change="e => props.row.ids = e.target.value.split(', ')"
                                    />
                                </q-popup-edit>
                            </q-td>
                            <q-td key="words" :props="props" style="width: 100px; white-space: normal;">
                                {{ props.row.words.join(', ') }}
                                <q-popup-edit
                                    :value="props.row.words.join(', ')"
                                    @input="v => props.row.words = v.split(', ')"
                                >
                                    <q-input
                                        :value="props.row.words.join(', ')"
                                        dense
                                        autofocus counter
                                        @focus="e => e.target.select()"
                                        @change="e => props.row.words = e.target.value.split(', ')"
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

<style lang="stylus" scoped>

.error
    color $negative

</style>

<script>
import { last } from 'lodash';

export default {
    name: 'CR',

    data: () => ({
        cr:   [],
        txt:  [],
        data: null,
        tab:  'content',

        contentFilter:  '',
        glossaryFilter: '',
    }),

    computed: {
        date: {
            get() {
                return this.$route.query.date ?? last(this.cr);
            },
            set(newValue) {
                this.$router.push({
                    query: {
                        ...this.$route.query,
                        date: newValue,
                    },
                });
            },
        },

        crOptions() {
            return this.txt.map(d => ({
                value:   d,
                label:   d,
                hasData: this.cr.includes(d),
            }));
        },

        contents() { return this.data?.contents ?? []; },
        glossary() { return this.data?.glossary ?? []; },

        contentTitle() {
            if (this.data != null) {
                return `Contents (${this.data.date})`;
            } else {
                return 'Contents';
            }
        },

        contentColumns() {
            return [
                { name: 'id', label: 'ID', field: 'id' },
                { name: 'depth', label: 'Depth', field: 'depth' },
                { name: 'index', label: 'Index', field: 'index' },
                { name: 'text', label: 'Text', field: 'text', align: 'left' },
            ];
        },

        duplicatedID() {
            const ids = this.contents.map(c => c.id);

            const count = { };

            for (const id of ids) {
                count[id] = (count[id] || 0) + 1;
            }

            return Object.keys(count).filter(id => count[id] > 1);
        },

        glossaryTitle() {
            if (this.data != null) {
                return `Glossary (${this.data.date})`;
            } else {
                return 'Glossary';
            }
        },

        glossaryColumns() {
            return [
                { name: 'ids', label: 'IDs', field: 'ids' },
                { name: 'words', label: 'Words', field: 'words' },
                { name: 'text', label: 'Text', field: 'text', align: 'left' },
            ];
        },
    },

    watch: {
        date() {
            if (this.cr.includes(this.date)) {
                this.loadData();
            }
        },
    },

    mounted() {
        this.loadList();
    },

    methods: {
        async loadList() {
            const { data: cr } = await this.apiGet('/magic/cr');
            const { data: txt } = await this.controlGet('/magic/cr/txt');

            this.cr = cr;
            this.txt = txt;

            if (this.data == null) {
                this.load();
            }
        },

        async loadData() {
            if (this.date != null && this.cr.includes(this.date)) {
                const { data } = await this.apiGet('/magic/cr/' + this.date);

                this.data = data;
            }
        },

        async parse() {
            if (this.date != null && !this.cr.includes(this.date)) {
                const { data } = await this.controlGet('/magic/cr/parse', { date: this.date });

                this.data = data;
            }
        },

        async save() {
            if (this.data != null) {
                await this.controlPost('/magic/cr/save', { data: this.data });

                this.loadList();
            }
        },

        async reparse() {
            if (this.date != null && this.cr.includes(this.date)) {
                const { data } = await this.controlGet('/magic/cr/reparse', { date: this.date });

                this.data = data;
            }
        },
    },
};
</script>
