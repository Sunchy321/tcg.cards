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
                :options="changeOutlines"
                option-label="date"
                outline
                dense options-dense
            />
            <pre
                v-if="data != null"
                class="q-ml-md"
                style="flex-grow: 1"
            >{{ data._id || 'unsaved' }}</pre>
            <q-btn
                v-if="data != null"
                icon="mdi-content-save"
                flat dense round
                @click="saveData"
            />
        </div>

        <template v-if="data != null">
            <div class="dates">
                <div>
                    <q-icon name="mdi-calendar" size="sm" class="q-mr-sm" />
                    <date-input v-model="date" dense />
                </div>
                <div>
                    <q-icon name="mdi-arrow-right-circle" size="sm" class="q-mr-sm" />
                    <date-input v-model="nextDate" dense />
                </div>
                <div>
                    <q-icon name="mdi-cards-outline" size="sm" class="q-mr-sm" />
                    <date-input v-model="eDateTable" dense />
                </div>
                <div>
                    <q-icon name="mdi-alpha-o-circle-outline" size="sm" class="q-mr-sm" />
                    <date-input v-model="eDateOnline" dense />
                </div>
                <div>
                    <q-icon name="mdi-alpha-a-circle-outline" size="sm" class="q-mr-sm" />
                    <date-input v-model="eDateArena" dense />
                </div>
            </div>
            <div
                v-for="l in data.link" :key="l"
                class="q-py-md"
            >
                <q-icon class="q-mr-md" name="mdi-link" />
                <a :href="l">{{ l }}</a>
            </div>
            <div class="row items-center">
                <q-icon name="mdi-card-bulleted-outline" size="sm" />
                <q-btn
                    class="q-ml-sm"
                    flat dense round
                    icon="mdi-plus"
                    @click="addChange"
                />
            </div>
            <div v-for="(c, i) in changes" :key="'change-' + i" class="row">
                <q-input
                    class="col"
                    :value="c.card"
                    dense
                    @input="v => modifyChangeCard(i, v)"
                />
                <q-select
                    :value="c.format"
                    :options="formatList"
                    :label="$t('magic.format-change.format')"
                    dense
                    emit-value
                    map-options
                    @input="v => modifyChangeFormat(i, v)"
                />
                <q-btn-toggle
                    :value="c.status"
                    :options="statusList"
                    flat
                    dense
                    @input="v => modifyChangeStatus(i, v)"
                />
                <q-btn
                    size="sm"
                    flat
                    dense
                    icon="mdi-arrow-up"
                    :disable="i === 0"
                    @click="moveChangeUp(i)"
                />
                <q-btn
                    size="sm"
                    flat
                    dense
                    icon="mdi-arrow-down"
                    :disable="i === changes.length - 1"
                    @click="moveChangeDown(i)"
                />
                <q-btn
                    size="sm"
                    flat
                    dense
                    icon="mdi-minus"
                    @click="removeChange(i)"
                />
            </div>
        </template>
    </div>
</template>

<style lang="stylus">

.dates
    display flex
    flex-direction row
    justify-content space-between

    & > *
        flex-grow 0
        display flex
        align-items center

</style>

<script>
import DateInput from 'components/DateInput';

import { capitalize, cloneDeep, deburr } from 'lodash';

function toIdentifier(text) {
    return deburr(text)
        .trim()
        .toLowerCase()
        .replace(' // ', '____')
        .replace('/', '____')
        .replace(/[^a-z0-9]/g, '_');
}

export default {
    components: { DateInput },

    data: () => ({
        url: '',

        changeOutlines: [],
        selected:       null,

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
            ].map(v => ({
                label: this.formatName(v),
                value: v,
            }));
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
            set(newDate) {
                const newValue = cloneDeep(this.data);
                newValue.date = newDate;
                this.data = newValue;
            },
        },

        nextDate: {
            get() {
                return this.data.nextDate;
            },
            set(newDate) {
                const newValue = cloneDeep(this.data);
                newValue.nextDate = newDate;
                this.data = newValue;
            },
        },

        eDateTable: {
            get() {
                return this.data.effectiveDate?.tabletop;
            },
            set(newDate) {
                const newValue = cloneDeep(this.data);

                if (newValue.effectiveDate == null) {
                    newValue.effectiveDate = {};
                }

                newValue.effectiveDate.tabletop = newDate;
                this.data = newValue;
            },
        },

        eDateOnline: {
            get() {
                return this.data.effectiveDate?.online;
            },
            set(newDate) {
                const newValue = cloneDeep(this.data);

                if (newValue.effectiveDate == null) {
                    newValue.effectiveDate = {};
                }

                newValue.effectiveDate.online = newDate;
                this.data = newValue;
            },
        },

        eDateArena: {
            get() {
                return this.data.effectiveDate?.arena;
            },
            set(newDate) {
                const newValue = cloneDeep(this.data);

                if (newValue.effectiveDate == null) {
                    newValue.effectiveDate = {};
                }

                newValue.effectiveDate.arena = newDate;
                this.data = newValue;
            },
        },

        changes: {
            get() {
                return this.data.changes ?? [];
            },
            set(newChanges) {
                const newValue = cloneDeep(this.data);
                newValue.changes = newChanges;
                this.data = newValue;
            },
        },
    },

    watch: {
        selected() {
            this.loadData();
        },
    },

    mounted() {
        this.loadOutline();
    },

    methods: {
        async loadOutline() {
            const { data } = await this.apiGet('/magic/banlist/change/outlines');

            this.changeOutlines = data;
            this.selected = data[0];
        },

        async loadData() {
            if (this.selected.id != null) {
                this.data = null;

                const { data } = await this.apiGet('/magic/banlist/change/raw', {
                    id: this.selected.id,
                });

                this.data = data;
            }
        },

        async parseUrl() {
            const { data } = await this.apiGet('/magic/banlist/change/parse', {
                url: this.url,
            });

            this.changes.unshift('');
            this.selected = { date: data.date };
            this.data = data;
        },

        async saveData() {
            await this.apiPost('/magic/banlist/change/save', {
                data: this.data,
            });

            this.loadOutline();
        },

        formatName(format) {
            if (format === '' || format == null) {
                return '';
            } else if (format.startsWith('block/')) {
                return capitalize(format);
            } else {
                return this.$t('magic.format.' + format);
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
                }
                if (card === '#{assign}') {
                    return 'mdi-lock';
                } else {
                    return 'mdi-help-circle-outline';
                }
            }
        },

        addChange() {
            const changes = cloneDeep(this.changes);

            const c = {};

            if (changes.length !== 0) {
                c.format = changes[changes.length - 1].format;
                c.status = changes[changes.length - 1].status;
            }

            changes.push(c);
            this.changes = changes;
        },

        removeChange(i) {
            const changes = cloneDeep(this.changes);
            changes.splice(i, 1);
            this.changes = changes;
        },

        moveChangeUp(i) {
            if (i !== 0) {
                const changes = cloneDeep(this.changes);

                const prev = changes[i - 1];
                changes[i - 1] = changes[i];
                changes[i] = prev;

                this.changes = changes;
            }
        },

        moveChangeDown(i) {
            if (i !== this.changes.length - 1) {
                const changes = cloneDeep(this.changes);

                const next = changes[i + 1];
                changes[i + 1] = changes[i];
                changes[i] = next;

                this.changes = changes;
            }
        },

        modifyChangeCard(i, v) {
            const changes = cloneDeep(this.changes);

            if (v.startsWith('#')) {
                changes[i].card = v;

                if (v === '#{assign}') {
                    delete changes[i].status;
                }
            } else {
                changes[i].card = toIdentifier(v);
            }

            this.changes = changes;
        },

        modifyChangeFormat(i, v) {
            const changes = cloneDeep(this.changes);
            changes[i].format = v;
            this.changes = changes;
        },

        modifyChangeStatus(i, v) {
            const changes = cloneDeep(this.changes);
            changes[i].status = v;
            this.changes = changes;
        },
    },
};
</script>
