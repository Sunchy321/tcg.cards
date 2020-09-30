<template>
    <q-page class="main">
        <div class="row">
            <q-select
                class="code"
                style="max-width: 300px"
                dense
                use-input hide-selected fill-input
                v-model="set"
                :options="setOptions"
                @filter="setFilter"
            >
                <template #option="scope">
                    <q-item
                        v-bind="scope.itemProps"
                        v-on="scope.itemEvents"
                    >
                        <q-item-section>
                            <q-item-label class="code">{{ scope.opt }}</q-item-label>
                        </q-item-section>
                    </q-item>
                </template>
            </q-select>

            <q-btn dense @click="syncScryfall">
                <q-icon :name="scryfallSyncIcon" class="q-mr-sm" />
                {{ $t('magic.set.sync-with-scryfall') }}
            </q-btn>

            <q-btn dense @click="syncMTGJSON">
                <q-icon :name="mtgjsonSyncIcon" class="q-mr-sm" />
                {{ $t('magic.set.sync-with-mtgjson') }}
            </q-btn>

            <div class="col" />

            <btn ref="upload" icon="mdi-upload" dense round @click="updateSet" />
        </div>
        <div class="row">
            <q-input class="col-grow" v-model="setId" label="ID" />
            <q-input class="col-grow" :value="scryfallCode" :label="$t('magic.set.scryfall-code')" disable />
            <q-input class="col-grow" :value="onlineCode" :label="$t('magic.set.online-code')" disable />
            <q-input class="col-grow" :value="tcgplayerId" :label="$t('magic.set.tcgplayer-id')" disable />
            <q-input class="col-grow" :value="block" :label="$t('magic.set.block')" disable />
            <q-input class="col-grow" :value="parent" :label="$t('magic.set.parent')" disable />
        </div>
        <div class="row">
            <q-input class="col-grow" :value="scryfallId" :label="$t('magic.set.scryfall-id')" disable />
        </div>
        <div class="row">
            <q-input class="col-grow" :value="setType" :label="$t('magic.set.set-type')" disable />
            <q-checkbox class="col-grow" :value="isDigital" :label="$t('magic.set.is-digital')" disable />
            <q-checkbox class="col-grow" :value="isFoilOnly" :label="$t('magic.set.is-foil-only')" disable />
            <q-input class="col-grow" :value="releaseDate" :label="$t('magic.set.release-date')" disable />
            <q-input class="col-grow" :value="cardCount" :label="$t('magic.set.card-count')" disable />
        </div>
        <div class="row">
            <q-table
                class="col-grow"
                :title="$t('magic.set.localization')"
                :data="localization"
                :columns="localizationColumn"
                row-key="lang"
                :pagination="{ rowsPerPage: 20 }"
            >
                <template #top>
                    <div class="q-table__title">
                        {{ $t('magic.set.localization') }}
                    </div>
                    <div class="col" />
                    <q-input class="q-mr-sm col" v-model="setUrl" dense>
                        <template #append>
                            <q-btn icon="mdi-file-document-box-search" flat round dense @click="getSetLocalization" />
                        </template>
                    </q-input>
                    <q-btn
                        class="q-mr-sm"
                        icon="mdi-plus"
                        round dense
                        @click="insertLocalization"
                    />
                    <q-btn
                        icon="mdi-checkbox-marked-circle-outline"
                        round dense
                        @click="insertAllLocalization"
                    />
                </template>
                <template #body="props">
                    <q-tr :props="props">
                        <q-td key="lang" :props="props">
                            {{ props.row.lang }}
                            <q-popup-edit v-model="props.row.lang">
                                <q-input v-model="props.row.lang" dense autofocus />
                            </q-popup-edit>
                        </q-td>
                        <q-td key="name" :props="props">
                            {{ props.row.name }}
                            <q-popup-edit v-model="props.row.name">
                                <q-input v-model="props.row.name" dense autofocus />
                            </q-popup-edit>
                        </q-td>
                        <q-td key="block" :props="props">
                            {{ props.row.block }}
                            <q-popup-edit v-model="props.row.block">
                                <q-input v-model="props.row.block" dense autofocus />
                            </q-popup-edit>
                        </q-td>
                        <q-td key="link" :props="props">
                            <a
                                v-if="props.row.link != null"
                                :href="props.row.link"
                            >
                                <q-icon name="mdi-link" />
                            </a>
                            <q-popup-edit v-model="props.row.link">
                                <q-input v-model="props.row.link" dense autofocus />
                            </q-popup-edit>
                        </q-td>
                        <q-td>
                            <q-btn
                                icon="mdi-close" size="sm"
                                round dense
                                @click="removeLocalization(props.row.__index)"
                            />
                        </q-td>
                    </q-tr>
                </template>
            </q-table>
        </div>
    </q-page>
</template>

<style lang="stylus">

.main > .row
    margin $space-md.x $space-md.y

.main > .row > *:not(:last-child)
    margin-right $space-sm.x

</style>

<script>
import Btn from 'components/Btn';

import basic from '../../mixins/basic';

import { cloneDeep } from 'lodash';

export default {
    name: 'Set',

    mixins: [basic],

    components: { Btn },

    data: () => ({
        sets:       [],
        setOptions: [],
        set:        null,

        setUrl: '',

        data: null,

        scryfallSyncing: false,
        mtgjsonSyncing:  false
    }),

    watch: {
        $route: {
            immediate: true,
            handler() {
                this.loadSets();
            }
        },

        set: {
            handler() {
                if (this.set != null) {
                    this.loadSet();
                }
            }
        }
    },

    computed: {
        scryfallSyncIcon() {
            return this.scryfallSyncing ? 'mdi-sync mdi-spin' : 'mdi-sync';
        },

        mtgjsonSyncIcon() {
            return this.mtgjsonSyncing ? 'mdi-sync mdi-spin' : 'mdi-sync';
        },

        setId: {
            get() {
                return this.data?.setId;
            },
            set(newSetId) {
                if (this.data != null) {
                    this.$set(this.data, 'setId', newSetId);
                }
            }
        },

        scryfallCode() {
            return this.data?.scryfall?.code;
        },

        scryfallId() {
            return this.data?.scryfall?.id;
        },

        onlineCode() {
            return this.data?.onlineCode;
        },

        tcgplayerId() {
            return this.data?.tcgplayerId;
        },

        block() {
            return this.data?.block;
        },

        parent() {
            return this.data?.parent;
        },

        setType() {
            return this.data?.setType;
        },

        isDigital() {
            return this.data?.isDigital;
        },

        isFoilOnly() {
            return this.data?.isFoilOnly;
        },

        releaseDate() {
            return this.data?.releaseDate;
        },

        cardCount() {
            return this.data?.cardCount;
        },

        localization: {
            get() {
                return this.data?.localization ?? [];
            },
            set(newLocalization) {
                this.$set(this.data, 'localization', newLocalization);
            }
        },

        localizationColumn() {
            return [
                {
                    name:  'lang',
                    label: this.$t('magic.set.localization/column.lang')
                },
                {
                    name:  'name',
                    label: this.$t('magic.set.localization/column.name')
                },
                {
                    name:  'block',
                    label: this.$t('magic.set.localization/column.block')
                },
                {
                    name:  'link',
                    label: this.$t('magic.set.localization/column.link')
                },
            ];
        }
    },

    methods: {
        async loadSets() {
            const { data } = await this.$axios.get('/data/magic/sets');

            this.sets = data;

            if (this.set == null) {
                this.set = data[0] ?? null;
            }
        },

        async loadSet() {
            if (this.set != null) {
                const { data } = await this.$axios.get('/control/magic/raw-set', {
                    params: {
                        id: this.set
                    }
                });

                this.data = data;
            }
        },

        async updateSet() {
            await this.$axios.post('/control/magic/update-set', {
                data: this.data
            });

            this.$refs.upload.flicker('positive');

            this.loadSets();
            this.loadSet();
        },

        async syncScryfall() {
            this.scryfallSyncing = true;
            await this.$axios.post('/control/magic/sync-scryfall-set');
            this.scryfallSyncing = false;
        },

        async syncMTGJSON() {
            this.mtgjsonSyncing = true;
            await this.$axios.post('/control/magic/sync-mtgjson-set');
            this.mtgjsonSyncing = false;
        },

        async getSetLocalization() {
            this.insertAllLocalization();

            const { data } = await this.$axios.get('/control/magic/parse-set', {
                params: { url: this.setUrl }
            });

            const localization = cloneDeep(this.localization);

            for (const l of localization) {
                const d = data.find(d => d.lang === l.lang);

                if (d != null) {
                    l.name = d.name;
                    l.link = d.link;
                }
            }

            this.localization = localization;
        },

        setFilter(value, update) {
            update(() => {
                this.setOptions = this.sets.filter(s => s.includes(value.toLowerCase()));
            });
        },

        insertLocalization() {
            this.localization.push({ });
        },

        insertAllLocalization() {
            const langs = this.basic.magic.basicLang;

            this.localization = [
                ...langs.map(l => this.localization.find(v => v.lang === l) ?? {
                    lang: l
                }),
                ...this.localization.filter(v => !langs.includes(v.lang)),
            ];
        },

        removeLocalization(idx) {
            this.localization = this.localization.filter((e, i) => i !== idx);
        }
    }
};
</script>
