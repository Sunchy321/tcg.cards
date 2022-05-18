<template>
    <q-page class="q-pa-md">
        <div class="row items-center q-mb-lg text-h5">
            <div class="q-mr-sm">{{ $t('magic.format.' + format) }}</div>
            <div>{{ birthAndDeath }}</div>

            <q-space />

            <div class="flex items-center">
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
        </div>

        <div v-if="showTimeline">
            <div v-for="n in nodes" :key="n.date" class="q-my-md">
                <div class="flex items-center q-mb-sm">
                    <span class="text-h6">{{ n.date }}</span>
                    <q-btn
                        v-for="l in n.link"
                        :key="l"
                        class="q-ml-sm"
                        icon="mdi-link"
                        flat dense round
                        :href="l"
                        target="_blank"
                    />
                </div>

                <grid
                    v-if="n.format.length > 0"
                    v-slot="{ set, type }"
                    :value="n.format" :item-width="300" item-class="flex items-center"
                >
                    <div class="format flex items-center q-gutter-sm">
                        <q-icon
                            :name="type === 'in' ? 'mdi-plus' : 'mdi-minus'"
                            :class="type === 'in' ? 'color-positive' : 'color-negative'"
                        />
                        <set-avatar :id="set" />
                    </div>
                </grid>

                <grid
                    v-if="n.banlist.length>0"
                    v-slot="{ status, card, group }"
                    :value="n.banlist" :item-width="300" item-key="card" item-class="flex items-center"
                >
                    <div class="banlist flex items-center q-gutter-sm">
                        <banlist-icon :status="status" />
                        <card-avatar :id="card" class="avatar" :pauper="format === 'pauper'" />
                        <span v-if="group != null" class="group">{{ groupShort(group) }}</span>
                    </div>
                </grid>
            </div>
        </div>

        <template v-else>
            <div class="flex items-center q-mb-md">
                <span class="text-h6">{{ $t('magic.ui.format.banlist') }}</span>

                <q-select
                    v-model="order"
                    class="q-ml-md"
                    :options="orderOptions"
                    dense outlined
                    emit-value map-options
                />
            </div>

            <grid
                v-slot="{ status, card, date: effectiveDate, group, link }"
                :value="banlist" :item-width="300" item-key="card" item-class="flex items-center"
            >
                <div class="banlist flex items-center q-gutter-sm">
                    <banlist-icon :status="status" />
                    <a v-if="link.length > 0" class="date" :href="link[0]" target="_blank">{{ effectiveDate }}</a>
                    <div v-else class="date">{{ effectiveDate }}</div>
                    <card-avatar :id="card" class="avatar" :pauper="format === 'pauper'" />
                    <span v-if="group != null" class="group">{{ groupShort(group) }}</span>
                </div>
            </grid>

            <div v-if="sets.length > 0" class="flex q-my-md">
                <span class="text-h6">{{ $t('magic.ui.format.set') }}</span>
            </div>

            <grid
                v-if="sets.length > 0"
                v-slot="{ id }"
                :value="sets.map(id => ({ id }))" :item-width="300" item-class="flex items-center"
            >
                <set-avatar :id="id" />
            </grid>
        </template>
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

    & > .avatar
        white-space: nowrap
        overflow: hidden
        text-overflow: ellipsis

.date
    color: grey

.group
    font-variant: small-caps
</style>

<script lang="ts">
import {
    defineComponent, ref, computed, watch,
} from 'vue';

import { useMagic } from 'store/games/magic';
import { useI18n } from 'vue-i18n';

import pageSetup from 'setup/page';

import Grid from 'components/Grid.vue';
import DateInput from 'components/DateInput.vue';
import CardAvatar from 'components/magic/CardAvatar.vue';
import BanlistIcon from 'components/magic/BanlistIcon.vue';
import SetAvatar from 'components/magic/SetAvatar.vue';

import { uniq } from 'lodash';

import { apiGet } from 'boot/backend';

export interface FormatChange {
    type: 'format';
    date: string;
    category: string;
    format: string;
    in: string[];
    out: string[];
}

export interface BanlistChange {
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
    };
    link: string[];
}

export type TimelineItem = BanlistChange | FormatChange;

export type TimelineNode = {
    date: string;
    link: string[];
    format: { set: string, type: string }[];
    banlist: { group?: string, card: string, status: string }[];
};

interface Data {
    birthday?: string;
    deathdate?: string;

    sets?: string[];
    banlist?: BanlistChange[];
}

export const banlistStatusOrder = ['banned', 'suspended', 'banned_as_commander', 'banned_as_companion', 'restricted', 'legal', 'unavailable'];
export const banlistSourceOrder = ['ante', 'offensive', 'conspiracy', 'legendary', null];

export default defineComponent({
    components: {
        Grid,
        DateInput,
        CardAvatar,
        BanlistIcon,
        SetAvatar,
    },

    setup() {
        const magic = useMagic();
        const i18n = useI18n();

        const formats = computed(() => magic.data.formats ?? []);

        const {
            format,
            timeline: showTimeline,
            date,
            order,
        } = pageSetup({
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
                timeline: {
                    type:    'boolean',
                    bind:    'query',
                    inTitle: true,
                    icon:    ['mdi-timeline-outline', 'mdi-timeline'],
                },
                date: {
                    type: 'date',
                    bind: 'query',
                },
                order: {
                    type:   'enum',
                    bind:   'query',
                    values: ['name', 'date'],
                },
            },
        });

        const data = ref<Data | null>(null);
        const timeline = ref<TimelineItem[]>([]);

        const orderOptions = ['name', 'date'].map(v => ({
            value: v,
            label: i18n.t(`magic.ui.format.sort-by.${v}`),
        }));

        const dateFrom = computed(() => data.value?.birthday ?? magic.data.birthday);
        const dateTo = computed(() => data.value?.deathdate ?? new Date().toLocaleDateString('en-CA'));

        const birthAndDeath = computed(() => {
            if (data.value?.birthday != null) {
                if (data.value?.deathdate != null) {
                    return `${data.value.birthday} ~ ${data.value.deathdate}`;
                } else {
                    return `${data.value.birthday} ~`;
                }
            } else {
                return '';
            }
        });

        const nodes = computed(() => {
            const result: TimelineNode[] = [];

            for (const v of timeline.value) {
                const node = result.find(r => r.date === v.date);

                if (v.type === 'format') {
                    const formatValue = [
                        ...v.in.map(s => ({ set: s, type: 'in' })),
                        ...v.out.map(s => ({ set: s, type: 'out' })),
                    ];

                    if (node == null) {
                        result.push({
                            date:    v.date,
                            link:    [],
                            format:  formatValue,
                            banlist: [],
                        });
                    } else {
                        node.format.push(...formatValue);
                    }
                } else {
                    const banlistValue = {
                        group:  v.group,
                        card:   v.card,
                        status: v.status,
                    };

                    if (node == null) {
                        result.push({
                            date:    v.date,
                            link:    v.link,
                            format:  [],
                            banlist: [banlistValue],
                        });
                    } else {
                        node.link.push(...v.link);
                        node.banlist.push(banlistValue);
                    }
                }
            }

            for (const v of result) {
                v.link = uniq(v.link);

                v.format.sort((a, b) => {
                    if (a.type !== b.type) {
                        return a.type === 'in' ? -1 : 1;
                    } else {
                        return a.set < b.set ? -1 : a.set > b.set ? 1 : 0;
                    }
                });

                v.banlist.sort((a, b) => {
                    if (a.status !== b.status) {
                        return banlistStatusOrder.indexOf(a.status)
                                - banlistStatusOrder.indexOf(b.status);
                    } else if (a.group !== b.group) {
                        return banlistSourceOrder.indexOf(a.group ?? null)
                                - banlistSourceOrder.indexOf(b.group ?? null);
                    } else {
                        return a.card < b.card ? -1 : 1;
                    }
                });
            }

            return result;
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

                        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                        result = result.filter(s => !c.out.includes(s));
                    }
                }

                return result;
            }
        });

        const banlist = computed(() => {
            const banlistItems = (() => {
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
                banlistItems.sort((a, b) => {
                    if (a.status !== b.status) {
                        return banlistStatusOrder.indexOf(a.status)
                                - banlistStatusOrder.indexOf(b.status);
                    } else if (a.group !== b.group) {
                        return banlistSourceOrder.indexOf(a.group ?? null)
                                - banlistSourceOrder.indexOf(b.group ?? null);
                    } else {
                        return a.card < b.card ? -1 : 1;
                    }
                });
                break;
            case 'date':
                banlistItems.sort((a, b) => {
                    if (a.date < b.date) {
                        return -1;
                    } else if (a.date > b.date) {
                        return 1;
                    }

                    if (a.status !== b.status) {
                        return banlistStatusOrder.indexOf(a.status)
                                - banlistStatusOrder.indexOf(b.status);
                    } else if (a.group !== b.group) {
                        return banlistSourceOrder.indexOf(a.group ?? null)
                                - banlistSourceOrder.indexOf(b.group ?? null);
                    } else {
                        return a.card < b.card ? -1 : 1;
                    }
                });
                break;
            default:
            }

            return banlistItems;
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

        const loadData = async () => {
            const { data: dataResult } = await apiGet<Data>('/magic/format', {
                id: format.value,
            });

            data.value = dataResult;

            const { data: timelineResult } = await apiGet<TimelineItem[]>('/magic/format/timeline', {
                id: format.value,
            });

            timeline.value = timelineResult;
        };

        const groupShort = (group: string) => {
            switch (group) {
            case 'ante': return 'ante';
            case 'legendary': return 'leg.';
            case 'conspiracy': return 'consp.';
            case 'offensive': return 'off.';
            default: return '';
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
            showTimeline,
            date,
            order,

            orderOptions,

            dateFrom,
            dateTo,

            birthAndDeath,
            timelineEvents,
            sets,
            banlist,
            nodes,

            groupShort,
            toPrevDate,
            toNextDate,
        };
    },

});
</script>
