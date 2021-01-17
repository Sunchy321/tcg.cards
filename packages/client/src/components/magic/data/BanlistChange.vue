<template>
    <div class="q-pa-md">
        <q-input
            v-model="url"
            dense
        >
            <template v-slot:append>
                <q-btn
                    icon="mdi-text-box-search"
                    flat dense round
                    @click="parseUrl"
                />
            </template>
        </q-input>

        <div class="row items-center q-py-md">
            <q-select
                v-model="selected"
                style="width: 150px"
                :options="changeList"
                option-label="date"
                outlined dense
            />

            <div v-if="data != null" class="code q-ml-md">
                {{ data._id || 'unsaved' }}
            </div>

            <div class="col-grow" />

            <q-btn label="sync" flat dense @click="sync" />
            <q-btn v-if="data != null" icon="mdi-upload" flat dense round @click="saveChange" />
        </div>

        <template v-if="data != null">
            <div class="row justify-between">
                <div class="row items-center">
                    <q-icon name="mdi-calendar" size="sm" class="q-mr-sm" />
                    <date-input v-model="date" dense />
                </div>
                <div class="row items-center">
                    <q-icon name="mdi-arrow-right-circle" size="sm" class="q-mr-sm" />
                    <date-input v-model="nextDate" dense />
                </div>
                <div class="row items-center">
                    <q-icon name="mdi-cards-outline" size="sm" class="q-mr-sm" />
                    <date-input v-model="eDateTable" dense />
                </div>
                <div class="row items-center">
                    <q-icon name="mdi-alpha-o-circle-outline" size="sm" class="q-mr-sm" />
                    <date-input v-model="eDateOnline" dense />
                </div>
                <div class="row items-center">
                    <q-icon name="mdi-alpha-a-circle-outline" size="sm" class="q-mr-sm" />
                    <date-input v-model="eDateArena" dense />
                </div>
            </div>
            <div class="row items-center q-my-sm">
                <q-icon name="mdi-link" size="sm" />
                <q-btn
                    class="q-ml-sm"
                    flat dense round
                    icon="mdi-plus"
                    @click="data.link.push('')"
                />
            </div>
            <q-input v-for="(l, i) in data.link" :key="l" v-model="data.link[i]" class="q-my-sm" dense />
            <div class="row items-center">
                <q-icon name="mdi-card-bulleted-outline" size="sm" />
                <q-btn
                    class="q-ml-sm"
                    flat dense round
                    icon="mdi-plus"
                    @click="addChange"
                />
            </div>
            <div v-for="(c, i) in changes" :key="'change-' + i" class="row q-gutter-sm">
                <q-input
                    v-model="c.card"
                    class="col"
                    dense
                />
                <q-select
                    v-model="c.format"
                    :options="formatList"
                    dense
                    emit-value
                    map-options
                />
                <q-btn-toggle
                    v-model="c.status"
                    :options="statusList"
                    flat dense
                    :toggle-color="null"
                    color="white"
                    text-color="grey"
                />
                <q-btn
                    size="sm"
                    flat dense
                    icon="mdi-arrow-up"
                    :disable="i === 0"
                    @click="moveChangeUp(i)"
                />
                <q-btn
                    size="sm"
                    flat dense
                    icon="mdi-arrow-down"
                    :disable="i === changes.length - 1"
                    @click="moveChangeDown(i)"
                />
                <q-btn
                    size="sm"
                    flat dense
                    icon="mdi-minus"
                    @click="removeChange(i)"
                />
            </div>
        </template>
    </div>
</template>

<script>
import DateInput from 'components/DateInput';

import { deburr, last } from 'lodash';

function toIdentifier(text) {
    return deburr(text)
        .trim()
        .toLowerCase()
        .replace(' // ', '____')
        .replace('/', '____')
        .replace(/[^a-z0-9]/g, '_');
}

export default {
    name: 'DataBanlistChange',

    components: { DateInput },

    data: () => ({
        url: '',

        changeList: [],
        selected:   null,

        data: null,
    }),

    computed: {
        formatList() {
            return [
                'standard',
                'historic',
                'pioneer',
                'modern',
                'extended',
                'legacy',
                'vintage',

                'standard/arena',

                'commander',
                'duelcommander',
                'commander1v1',
                'brawl',

                'pauper',

                'block/ice_age',
                'block/tempest',
                'block/urza',
                'block/masques',
                'block/mirrodin',
            ];
        },

        statusList() {
            return [
                'legal',
                'banned',
                'suspended',
                'restricted',
                'banned_as_commander',
                'unavailable',
            ].map(v => ({
                icon:  this.statusIcon(v),
                class: 'magic-banlist-status-' + v,
                value: v,
            }));
        },

        date: {
            get() {
                return this.data.date;
            },
            set(newValue) {
                if (this.data != null) {
                    this.data.date = newValue;
                }
            },
        },

        nextDate: {
            get() {
                return this.data.nextDate;
            },
            set(newValue) {
                if (this.data != null) {
                    this.data.nextDate = newValue;
                }
            },
        },

        eDateTable: {
            get() {
                return this.data.effectiveDate?.tabletop;
            },
            set(newValue) {
                if (this.data != null) {
                    this.data.effectiveDate = {
                        ...this.data.effectiveDate ?? {},
                        tabletop: newValue,
                    };
                }
            },
        },

        eDateOnline: {
            get() {
                return this.data.effectiveDate?.online;
            },
            set(newValue) {
                if (this.data != null) {
                    this.data.effectiveDate = {
                        ...this.data.effectiveDate ?? {},
                        online: newValue,
                    };
                }
            },
        },

        eDateArena: {
            get() {
                return this.data.effectiveDate?.arena;
            },
            set(newValue) {
                if (this.data != null) {
                    this.data.effectiveDate = {
                        ...this.data.effectiveDate ?? {},
                        arena: newValue,
                    };
                }
            },
        },

        changes() {
            return this.data.changes ?? [];
        },
    },

    watch: {
        selected() {
            this.loadChange();
        },
    },

    mounted() {
        this.loadData();
    },

    methods: {
        async loadData() {
            const { data } = await this.apiGet('/magic/format/banlist/change');

            this.changeList = data;

            if (data.length > 0 && this.selected == null) {
                this.selected = data[0];
            }
        },

        async loadChange() {
            if (this.selected.id != null) {
                this.data = null;

                const { data } = await this.apiGet('/magic/format/banlist/change', {
                    id: this.selected.id,
                });

                this.data = data;
            }
        },

        async parseUrl() {
            const { data } = await this.apiGet('/magic/format/banlist/change/parse', {
                url: this.url,
            });

            this.changes.unshift('');
            this.selected = { date: data.date };
            this.data = data;
        },

        async saveChange() {
            await this.apiPost('/magic/format/banlist/change/save', {
                data: this.data,
            });

            this.loadData();
        },

        async sync() {
            const { data, status } = await this.apiPost('/magic/format/sync');

            if (status === 500) {
                console.log(data);
            }
        },

        statusIcon(status, card) {
            switch (status) {
            case 'banned':
                return 'mdi-close-circle-outline';
            case 'suspended':
                return 'mdi-help-circle-outline';
            case 'banned_as_commander':
                return 'mdi-progress-close';
            case 'restricted':
                return 'mdi-alert-circle-outline';
            case 'legal':
                return 'mdi-check-circle-outline';
            case 'unavailable':
                return 'mdi-cancel';
            case undefined:
                if (card.startsWith('#{clone:')) {
                    return 'mdi-content-copy';
                } else {
                    return 'mdi-help-circle-outline';
                }
            }
        },

        addChange() {
            if (this.changes.length !== 0) {
                this.changes.push({ format: last(this.changes).format, status: last(this.changes).status });
            } else {
                this.changes.push({});
            }
        },

        removeChange(i) {
            this.changes.splice(i, 1);
        },

        moveChangeUp(i) {
            if (i !== 0) {
                const curr = this.changes[i];
                const prev = this.changes[i - 1];

                this.$set(this.changes, i - 1, curr);
                this.$set(this.changes, i, prev);
            }
        },

        moveChangeDown(i) {
            if (i !== this.changes.length - 1) {
                const curr = this.changes[i];
                const next = this.changes[i + 1];

                this.$set(this.changes, i + 1, curr);
                this.$set(this.changes, i, next);
            }
        },

        modifyChangeCard(i, v) {
            if (v.startsWith('#')) {
                this.changes[i].card = v;

                if (v === '#{assign}') {
                    delete this.changes[i].status;
                }
            } else {
                this.changes[i].card = toIdentifier(v);
            }
        },
    },
};
</script>
