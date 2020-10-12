<template>
    <q-page>
        <div class="q-pa-md row">
            <q-select
                v-model="format"
                class="code"
                style="max-width: 300px"
                dense :options="formats"
            >
                <template #option="scope">
                    <q-item
                        v-bind="scope.itemProps"
                        v-on="scope.itemEvents"
                    >
                        <q-item-section>
                            <q-item-label class="code">
                                {{ scope.opt }}
                            </q-item-label>
                        </q-item-section>
                    </q-item>
                </template>
                <template #after>
                    <q-btn
                        ref="create"
                        icon="mdi-plus"
                        dense round
                    >
                        <q-popup-edit
                            v-model="inputNewFormat"
                            :cover="false"
                            anchor="bottom middle"
                            self="top middle"
                            @save="newFormat"
                        >
                            <q-input
                                v-model="inputNewFormat"
                                dense autofocus
                            />
                        </q-popup-edit>
                    </q-btn>
                </template>
            </q-select>

            <div class="col" />

            <btn
                ref="update"
                icon="mdi-upload"
                dense round
                @click="updateFormat"
            />
        </div>

        <template v-if="data != null">
            <div class="q-pa-md">
                <q-input
                    v-model.number="order"
                    dense
                    type="number"
                    :label="$t('magic.format.order')"
                />
            </div>

            <div class="q-pa-md">
                <q-table
                    :title="$t('magic.format.localization')"
                    :data="localization"
                    :columns="localizationColumn"
                    row-key="lang"
                >
                    <template #top>
                        <div class="q-table__title">
                            {{ $t('magic.format.localization') }}
                        </div>
                        <div class="col" />
                        <q-btn
                            icon="mdi-plus"
                            round dense
                            @click="insertLocalization"
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
                        </q-tr>
                    </template>
                </q-table>
            </div>
        </template>
    </q-page>
</template>

<script>
import Btn from 'components/Btn';

export default {
    name: 'Format',

    components: { Btn },

    data() {
        return {
            formats: [],
            format:  null,

            data: null,

            inputNewFormat: '',
            showNewFormat:  false,
        };
    },

    computed: {
        order: {
            get() {
                return this.data?.order;
            },
            set(newOrder) {
                if (this.data != null) {
                    this.data.order = newOrder;
                    this.$forceUpdate();
                }
            },
        },

        localization() {
            return this.data?.localization ?? [];
        },

        localizationColumn() {
            return [
                {
                    name:  'lang',
                    label: this.$t('magic.format.localization/column.lang'),
                },
                {
                    name:  'name',
                    label: this.$t('magic.format.localization/column.name'),
                },
            ];
        },
    },

    watch: {
        $route: {
            immediate: true,
            handler() {
                this.loadFormats();
            },
        },

        format: {
            handler() {
                if (this.format != null) {
                    this.loadFormat();
                }
            },
        },
    },

    methods: {
        async loadFormats() {
            const { data } = await this.$axios.get('/data/magic/formats');

            this.formats = data;

            if (this.format == null) {
                this.format = data[0] ?? null;
            }
        },

        async loadFormat() {
            if (this.format != null) {
                const { data } = await this.$axios.get('/control/magic/raw-format', {
                    params: {
                        id: this.format,
                    },
                });

                this.data = data;
            }
        },

        async newFormat() {
            const newId = this.inputNewFormat;

            if (newId == null || newId === '') {
                return;
            }

            const { data } = await this.$axios.post('/control/magic/create-format', {
                id: newId,
            });

            if (data) {
                this.$refs.create.flicker('positive');
                this.inputNewFormat = '';
                this.loadFormats();
            } else {
                this.$refs.create.flicker('negative');
            }
        },

        async updateFormat() {
            await this.$axios.post('/control/magic/update-format', {
                data: this.data,
            });

            this.$refs.update.flicker('positive');

            this.loadFormats();
            this.loadFormat();
        },

        async insertLocalization() {
            this.localization.push({ });
        },
    },
};
</script>

<style lang="stylus" scoped>

</style>
