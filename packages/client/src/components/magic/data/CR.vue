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
                @click="load"
            />

            <q-btn
                label="Save"
                dense outline
                @click="save"
            />

            <q-checkbox v-model="onlySlide" label="Only Slide" />

            <span v-if="duplicatedID.length > 0" class="error">Duplicated ID {{ duplicatedID.join(', ') }}</span>

            <div class="col-grow" />

            <q-tabs v-model="tab">
                <q-tab name="intro" label="Intro" />
                <q-tab name="content" label="Content" />
                <q-tab name="glossary" label="Glossary" />
                <q-tab name="credits" label="Credits" />
            </q-tabs>
        </div>

        <q-tab-panels v-model="tab" animated>
            <q-tab-panel name="intro">
                <q-input v-model="intro" type="textarea" autogrow />
            </q-tab-panel>
            <q-tab-panel name="content">
                <q-table
                    title="Contents"
                    :data="filteredContents"
                    :columns="contentColumns"
                    row-key="id"
                    :pagination="{ rowsPerPage: 50 }"
                >
                    <template v-slot:body="props">
                        <q-tr :props="props">
                            <q-td key="id" :props="props">
                                {{ props.row.id }}
                                <q-popup-edit v-model="props.row.id">
                                    <q-input
                                        v-model="props.row.id"
                                        dense autofocus counter
                                        @focus="e => e.target.select()"
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
                                {{ props.row.text }}
                            </q-td>
                        </q-tr>
                    </template>
                </q-table>
            </q-tab-panel>
            <q-tab-panel name="glossary">
                123
            </q-tab-panel>
            <q-tab-panel name="credits">
                <q-input v-model="credits" type="textarea" autogrow />
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
        cr:        [],
        txt:       [],
        date:      null,
        data:      null,
        onlySlide: false,
        tab:       'content',
    }),

    computed: {
        crOptions() {
            return this.txt.map(d => ({
                value:   d,
                label:   d,
                hasData: this.cr.includes(d),
            }));
        },

        intro() { return this.data?.intro ?? ''; },
        contents() { return this.data?.contents ?? []; },
        glossary() { return this.data?.glossary ?? []; },
        credits() { return this.data?.credits ?? ''; },

        contentColumns() {
            return [
                { name: 'id', label: 'ID', field: 'id' },
                { name: 'depth', label: 'Depth', field: 'depth' },
                { name: 'index', label: 'Index', field: 'index' },
                { name: 'text', label: 'Text', field: 'text', align: 'left' },
            ];
        },

        filteredContents() {
            if (this.onlySlide) {
                return this.contents.filter(c => c.id.startsWith('~'));
            } else {
                return this.contents;
            }
        },

        duplicatedID() {
            const ids = this.contents.map(c => c.id);

            const count = { };

            for (const id of ids) {
                count[id] = (count[id] || 0) + 1;
            }

            return Object.keys(count).filter(id => count[id] > 1);
        },
    },

    mounted() {
        this.loadData();
    },

    methods: {
        async loadData() {
            const { data: cr } = await this.apiGet('/magic/cr/list');
            const { data: txt } = await this.apiGet('/magic/cr/txt');

            this.cr = cr;
            this.txt = txt;
            this.date = last(txt);

            if (this.cr.includes(this.date)) {
                this.load();
            }
        },

        async load() {
            if (this.date != null && this.cr.includes(this.date)) {
                const { data } = await this.apiGet('/magic/cr', { date: this.date });

                this.data = data;
            }
        },

        async parse() {
            if (this.date != null && !this.cr.includes(this.date)) {
                const { data } = await this.apiGet('/magic/cr/parse', { date: this.date });

                this.data = data;
            }
        },

        async save() {
            if (this.data != null) {
                await this.apiPost('/magic/cr/save', { data: this.data });

                this.loadData();
            }
        },
    },
};
</script>
