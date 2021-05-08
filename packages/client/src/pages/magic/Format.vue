<template>
    <q-page class="q-pa-md">
        <div class="title row items-center q-mb-lg">
            <div class="q-mr-sm">{{ $t('magic.format.' + format) }}</div>
            <div>{{ birthAndDeath }}</div>

            <q-select
                v-model="order"
                class="q-ml-xl"
                :options="orderOptions"
                dense outlined
                emit-value map-options
            />

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

        <div class="row q-mb-md">
            <div v-for="s in sets" :key="s" class="set code">
                {{ s }}
            </div>
        </div>

        <grid
            v-slot="{ status, card, date: effectiveDate }"
            :value="banlist" :item-width="300" item-key="card"
        >
            <div class="banlist row items-center q-gutter-sm">
                <q-icon
                    :name="statusIcon(status, card)"
                    :class="'magic-banlist-status-' + status"
                />
                <div class="date">{{ effectiveDate }}</div>
                <card-avatar :id="card" :pauper="format === 'pauper'" />
            </div>
        </grid>
    </q-page>
</template>

<style lang="sass" scoped>
.title
    font-size: 24px

.set
    padding: 5px

.banlist
    flex-wrap: nowrap

    & > .date
        flex-shrink: 0

.date
    color: grey
</style>

<script lang="ts">
import { defineComponent, ref, computed, watch } from 'vue';

import { useRouter, useRoute } from 'vue-router';
import { useStore } from 'src/store';
import { useI18n } from 'vue-i18n';

import pageSetup from 'setup/page';

import Grid from 'components/Grid.vue';
import DateInput from 'components/DateInput.vue';
import CardAvatar from 'components/magic/CardAvatar.vue';

import { apiGet } from 'boot/backend';

const banlistStatusOrder = ['banned', 'suspended', 'banned_as_commander', 'banned_as_companion', 'restricted', 'legal', 'unavailable'];
const banlistSourceOrder = ['ante', 'offensive', 'conspiracy', 'legendary', null];

interface FormatChange {
    type: 'format';
    date: string;
    category: string;
    format: string;
    in: string[];
    out: string[];
}

interface BanlistChange {
    type: 'banlist';
    date: string;
    category: string;
    group?: string;
    format: string;
    card: string;
    status: string;
    effectiveDate: {
        tabletop?: string;
        online?: string;
        arena?: string;
    },
    link: string[];
}

interface Data {
    birthday?: string;
    deathdate?: string;

    sets?: string[]
    banlist?: BanlistChange[]
}

type TimelineItem = FormatChange | BanlistChange;

export default defineComponent({
    components: { Grid, DateInput, CardAvatar },

    setup() {
        const router = useRouter();
        const route = useRoute();
        const store = useStore();
        const i18n = useI18n();

        const formats = computed(() => { return store.getters['magic/data']?.formats ?? []; });

        const { format, order } = pageSetup({
            title: () => i18n.t('magic.ui.format.$self'),

            params: {
                format: {
                    type:    'enum',
                    bind:    'params',
                    key:     'id',
                    inTitle: true,
                    values:  formats,
                    label:   (v: string) => i18n.t(`magic.format.${v}`),
                },
                order: {
                    type:   'enum',
                    bind:   'query',
                    values: ['name', 'date'],
                },
            },
        });

        const data = ref<Data|null>(null);
        const timeline = ref<TimelineItem[]>([]);

        const orderOptions = ['name', 'date'].map(v => ({
            value: v,
            label: i18n.t('magic.ui.format.sort-by.' + v),
        }));

        const date = computed({
            get() { return route.query.date as string; },
            set(newValue: string | null) {
                if (newValue != null) {
                    void router.replace({ query: { date: newValue } });
                } else {
                    void router.replace({ query: { } });
                }
            },
        });

        const dateFrom = computed(() => { return data.value?.birthday ?? store.getters['magic/data'].birthday; });
        const dateTo = computed(() => { return data.value?.deathdate ?? new Date().toLocaleDateString('en-CA'); });

        const birthAndDeath = computed(() => {
            if (data.value?.birthday != null) {
                if (data.value?.deathdate != null) {
                    return data.value.birthday + ' ~ ' + data.value.deathdate;
                } else {
                    return data.value.birthday + ' ~';
                }
            } else {
                return '';
            }
        });

        const sets = computed(() => {
            if (date.value == null || !['standard', 'pioneer', 'modern', 'extended', 'brawl'].includes(format.value)) {
                return data.value?.sets ?? [];
            } else {
                let result: string[] = [];

                for (const c of timeline.value) {
                    if (c.type === 'format') {
                        if (c.date > date.value) {
                            break;
                        }

                        result.push(...c.in);

                        result = result.filter(s => !c.out.includes(s));
                    }
                }

                return result;
            }
        });

        const banlist = computed(() => {
            const result = (() => {
                if (date.value == null) {
                    return data.value?.banlist ?? [];
                } else {
                    let result: BanlistChange[] = [];

                    for (const c of timeline.value) {
                        if (c.type === 'banlist') {
                            if (c.date > date.value) {
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

                    return result;
                }
            })();

            switch (order.value) {
            case 'name':
                result.sort((a, b) => {
                    if (a.status !== b.status) {
                        return banlistStatusOrder.indexOf(a.status) -
                                banlistStatusOrder.indexOf(b.status);
                    } else if (a.group !== b.group) {
                        return banlistSourceOrder.indexOf(a.group ?? null) -
                                banlistSourceOrder.indexOf(b.group ?? null);
                    } else {
                        return a.card < b.card ? -1 : 1;
                    }
                });
                break;
            case 'date':
                result.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
            }

            return result;
        });

        const timelineEvents = computed(() => {
            const result = [];

            for (const t of timeline.value) {
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
        });

        const loadData = async() => {
            const { data: dataResult } = await apiGet<Data>('/magic/format/' + format.value);

            data.value = dataResult;

            const { data: timelineResult } = await apiGet<TimelineItem[]>(`/magic/format/${format.value}/timeline`);

            timeline.value = timelineResult;
        };

        const statusIcon = (status: string, card: string) => {
            switch (status) {
            case 'banned':
                return 'mdi-close-circle-outline';
            case 'suspended':
                return 'mdi-minus-circle-outline';
            case 'banned_as_commander':
                return 'mdi-progress-close';
            case 'banned_as_companion':
                return 'mdi-heart-circle-outline';
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
        };

        const toPrevDate = () => {
            const currDate = date.value ?? new Date().toLocaleDateString('en-CA');

            for (const { date: dateValue } of timelineEvents.value.slice().reverse()) {
                if (dateValue < currDate) {
                    date.value = dateValue;
                    return;
                }
            }
        };

        const toNextDate = () => {
            const currDate = date.value ?? new Date().toLocaleDateString('en-CA');

            for (const { date: dateValue } of timelineEvents.value) {
                if (dateValue > currDate) {
                    date.value = dateValue;
                    return;
                }
            }
        };

        watch(format, loadData, { immediate: true });

        return {
            format,
            date,
            order,

            orderOptions,

            dateFrom,
            dateTo,

            birthAndDeath,
            timelineEvents,
            sets,
            banlist,

            statusIcon,
            toPrevDate,
            toNextDate,
        };
    },

});
</script>
