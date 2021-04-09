<template>
    <div class="q-pa-md">
        <div class="title row items-center q-mb-lg">
            <div class="q-mr-sm">{{ $t('magic.format.' + id) }}</div>
            <div>{{ birthAndDeath }}</div>

            <div class="col-grow" />

            <q-btn
                icon="mdi-arrow-left-circle"
                flat dense round
                @click="toPrevDate"
            />

            <date-input
                v-model="date"
                class="q-mx-sm"
                dense outlined clearable
                :date-from="dateFrom"
                :date-to="dateTo"
                :events="timelineEvents"
            />

            <q-btn
                icon="mdi-arrow-right-circle"
                flat dense round
                @click="toNextDate"
            />
        </div>

        <div v-if="sets.length > 0" class="row q-mb-md q-gutter-sm">
            <div v-for="s in sets" :key="s" class="set">
                {{ s }}
            </div>
        </div>

        <div v-if="banlist.length > 0" class="row">
            <div v-for="b in banlist" :key="b.card" class="banlist row items-center q-gutter-sm">
                <q-icon
                    :name="statusIcon(b.status, b.card)"
                    :class="'magic-banlist-status-' + b.status"
                />
                <div class="date">
                    {{ b.date }}
                </div>
                <div>{{ b.card }}</div>
            </div>
        </div>
    </div>
</template>

<style lang="stylus" scoped>
.title
    font-size 24px

.set
    border black 1px solid
    border-radius 5px
    padding 2px

.banlist
    flex-basis 300px
    flex-shrink 0
    flex-grow 1

.date
    color grey
</style>

<script>
import page from 'src/mixins/page';
import magic from 'src/mixins/magic';

import DateInput from 'components/DateInput';

const banlistStatusOrder = ['banned', 'suspended', 'banned_as_commander', 'restricted', 'legal', 'unavailable'];
const banlistSourceOrder = ['ante', 'conspiracy', 'legendary', null];

export default {
    name: 'Format',

    components: { DateInput },

    mixins: [page, magic],

    data: () => ({
        data:     null,
        timeline: [],
    }),

    computed: {
        pageOptions() {
            return {
                params: {
                    format: this.formats.map(f => ({
                        value: f,
                        label: this.$t('magic.format.' + f),
                    })),
                },
            };
        },

        title() { return this.$t('magic.ui.format.$self'); },

        date: {
            get() { return this.$route.query.date; },
            set(newValue) {
                if (newValue != null) {
                    this.$router.replace({ query: { date: newValue } });
                } else {
                    this.$router.replace({ query: { } });
                }
            },
        },

        dateFrom() { return (this.data?.birthday ?? this.$store.getters['magic/data'].birthday); },
        dateTo() { return (this.data?.deathdate ?? new Date().toLocaleDateString('en-CA')); },

        formats() { return this.$store.getters['magic/data']?.formats ?? []; },

        id() { return this.$route.params.id; },

        birthAndDeath() {
            if (this.data?.birthday != null) {
                if (this.data?.deathdate != null) {
                    return this.data.birthday + ' ~ ' + this.data.deathdate;
                } else {
                    return this.data.birthday + ' ~';
                }
            } else {
                return '';
            }
        },

        sets() {
            if (this.date == null || !['standard', 'pioneer', 'modern', 'extended'].includes(this.id)) {
                return this.data?.sets ?? [];
            } else {
                let result = [];

                for (const c of this.timeline) {
                    if (c.type === 'format') {
                        if (c.date > this.date) {
                            break;
                        }

                        result.push(...c.in);

                        result = result.filter(s => !c.out.includes(s));
                    }
                }

                return result;
            }
        },

        banlist() {
            if (this.date == null) {
                return this.data?.banlist ?? [];
            } else {
                let result = [];

                for (const c of this.timeline) {
                    if (c.type === 'banlist') {
                        if (c.date > this.date) {
                            break;
                        }

                        if (c.status === 'legal' || c.status === 'unavailable') {
                            result = result.filter(v => v.card !== c.card);
                        } else {
                            const sameIndex = result.findIndex(b => b.card === c.card);

                            if (sameIndex === -1) {
                                result.push(c);
                            } else {
                                result.splice(sameIndex, 1, c);
                            }
                        }
                    }
                }

                result.sort((a, b) => {
                    if (a.status !== b.status) {
                        return banlistStatusOrder.indexOf(a.status) -
                    banlistStatusOrder.indexOf(b.status);
                    } else if (a.source !== b.source) {
                        return banlistSourceOrder.indexOf(a.source ?? null) -
                    banlistSourceOrder.indexOf(b.source ?? null);
                    } else {
                        return a.card < b.card ? -1 : 1;
                    }
                });

                return result;
            }
        },

        timelineEvents() {
            const result = [];

            for (const t of this.timeline) {
                const v = result.find(r => r.date === t.date);

                if (v != null) {
                    if (t.type === 'format') {
                        v.color = 'cyan';
                    }
                } else {
                    result.push({
                        date:  t.date,
                        color: t.type === 'format' ? 'cyan' : 'orange',
                    });
                }
            }

            return result;
        },

    },

    watch: {
        '$store.getters.params.format'() {
            const format = this.$store.getters.params.format;

            if (format !== this.id && format != null) {
                this.$router.push({ name: 'magic/format', params: { id: format } });
            }
        },

        id: {
            immediate: true,
            handler() {
                if (this.$store.getters.params.format !== this.id) {
                    this.$store.commit('param', { key: 'format', value: this.id });
                }

                this.loadData();
            },
        },
    },

    methods: {
        async loadData() {
            const { data } = await this.apiGet('/magic/format/' + this.id);

            this.data = data;

            const { data:timeline } = await this.apiGet(`/magic/format/${this.id}/timeline`);

            this.timeline = timeline;
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

        toPrevDate() {
            const currDate = this.date ?? new Date().toLocaleDateString('en-CA');

            for (const { date } of this.timelineEvents.slice().reverse()) {
                if (date < currDate) {
                    this.date = date;
                    return;
                }
            }
        },

        toNextDate() {
            const currDate = this.date ?? new Date().toLocaleDateString('en-CA');

            for (const { date } of this.timelineEvents) {
                if (date > currDate) {
                    this.date = date;
                    return;
                }
            }
        },
    },
};
</script>
