<template>
    <q-page class="q-pa-md">
        <div class="row items-center q-mb-lg text-h5">
            <div class="q-mr-sm">{{ $t('yugioh.format.' + format) }}</div>
            <div>{{ birthAndDeath }}</div>

            <q-space />

            <div v-if="!showTimeline" class="flex items-center">
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
                    v-if="n.sets.length > 0"
                    v-slot="{ id, status }"
                    :value="n.sets" :item-width="300" item-class="flex items-center"
                >
                    <div class="sets flex items-center q-gutter-sm">
                        <q-icon
                            :name="status === 'in' ? 'mdi-plus' : 'mdi-minus'"
                            :class="status === 'in' ? 'color-positive' : 'color-negative'"
                        />
                        <set-avatar :id="id" />
                    </div>
                </grid>

                <grid
                    v-if="n.banlist.length>0"
                    v-slot="{ id, status, group }"
                    :value="n.banlist" :item-width="300" item-class="flex items-center"
                >
                    <div class="banlist flex items-center q-gutter-sm">
                        <banlist-icon :status="status" />
                        <card-avatar :id="id" class="avatar" :pauper="formatIsPauper" />
                        <span v-if="group != null" class="group">{{ groupShort(group) }}</span>
                    </div>
                </grid>
            </div>
        </div>

        <template v-else>
            <div class="flex items-center q-mb-md">
                <span class="text-h6">{{ $t('yugioh.ui.format.banlist') }}</span>

                <q-btn-toggle
                    v-model="order"
                    class="q-ml-md"
                    :options="orderOptions"
                    outline
                >
                    <template #name>
                        <q-icon name="mdi-cards-outline" />
                    </template>
                    <template #date>
                        <q-icon name="mdi-clock-outline" />
                    </template>
                </q-btn-toggle>
            </div>

            <grid
                v-slot="{ id, status, date: effectiveDate, group, link }"
                :value="banlist" :item-width="300" item-class="flex items-center"
            >
                <div class="banlist flex items-center q-gutter-sm">
                    <banlist-icon :status="status" />
                    <a v-if="link.length > 0" class="date" :href="link[0]" target="_blank">{{ effectiveDate }}</a>
                    <div v-else class="date">{{ effectiveDate }}</div>
                    <card-avatar :id="id" class="avatar" :pauper="formatIsPauper" />
                    <span v-if="group != null" class="group">{{ groupShort(group) }}</span>
                </div>
            </grid>

            <div v-if="sets.length > 0" class="flex q-my-md">
                <span class="text-h6">{{ $t('yugioh.ui.format.set') }}</span>
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

<script setup lang="ts">
import {
    ref, computed, watch,
} from 'vue';

import { useYugioh } from 'store/games/yugioh';
import { useI18n } from 'vue-i18n';

import pageSetup from 'setup/page';

import Grid from 'components/Grid.vue';
import DateInput from 'components/DateInput.vue';
import CardAvatar from 'components/yugioh/CardAvatar.vue';
import BanlistIcon from 'components/yugioh/BanlistIcon.vue';
// import SetAvatar from 'components/yugioh/SetAvatar.vue';

import { Format } from 'interface/yugioh/format';
import { FormatChange, Legality } from 'interface/yugioh/format-change';

import { last, uniq } from 'lodash';

import { apiGet } from 'boot/server';

import { banlistStatusOrder, banlistSourceOrder } from 'static/yugioh/misc';

interface BanlistItem {
    date: string;
    link: string[];

    id:     string;
    status: Legality;
    group?: string;
}

interface TimelineNode {
    date: string;
    link: string[];

    sets:    { id: string, status: 'in' | 'out' }[];
    banlist: { id: string, status: Legality, group?: string }[];
}

const yugioh = useYugioh();
const i18n = useI18n();

const formats = computed(() => yugioh.formats);

const {
    format,
    timeline: showTimeline,
    date,
    order,
} = pageSetup({
    title: () => i18n.t('yugioh.format.$self'),

    params: {
        format: {
            type:    'enum',
            bind:    'params',
            key:     'id',
            inTitle: true,
            values:  formats,
            label:   (v: string) => i18n.t(`yugioh.format.${v}`),
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

const data = ref<Format | null>(null);
const changes = ref<FormatChange[]>([]);

const orderOptions = ['name', 'date'].map(v => ({
    value: v,
    slot:  v,
}));

const dateFrom = computed(() => data.value?.birthday ?? yugioh.birthday);
const dateTo = computed(() => data.value?.deathdate ?? new Date().toISOString().split('T')[0]);

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

const formatIsPauper = computed(() => {
    switch (format.value) {
    case 'pauper':
        return 'pauper';
    case 'pauper_commander':
    case 'pauper_duelcommander':
        return 'pdh';
    default:
        return undefined;
    }
});

const nodes = computed(() => {
    const result: TimelineNode[] = [];

    for (const c of changes.value) {
        const node = (() => {
            const value = result.find(r => r.date === c.date);

            if (value != null) {
                return value;
            } else {
                result.push({
                    date:    c.date,
                    link:    c.link ?? [],
                    sets:    [],
                    banlist: [],
                });

                return last(result)!;
            }
        })();

        if (c.type === 'set') {
            node.sets.push({ id: c.id, status: c.status as 'in' | 'out' });
        } else {
            node.banlist.push({
                id:     c.id,
                status: c.status as Legality,
                group:  c.group,
            });
        }
    }

    for (const v of result) {
        v.link = uniq(v.link);

        v.sets.sort((a, b) => {
            if (a.status !== b.status) {
                return a.status === 'in' ? -1 : 1;
            } else {
                return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
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
                return a.id < b.id ? -1 : 1;
            }
        });
    }

    return result;
});

const sets = computed(() => {
    let result: string[] = [];

    for (const c of changes.value) {
        if (c.type === 'set') {
            if (c.date > date.value) {
                break;
            }

            if (c.status === 'in') {
                result.push(c.id);
            } else {
                result = result.filter(s => s !== c.id);
            }
        }
    }

    return result;
});

const banlist = computed(() => {
    const banlistItems = (() => {
        let result: BanlistItem[] = [];

        for (const c of changes.value) {
            if (c.type === 'card') {
                if (c.date > date.value) {
                    break;
                }

                if (c.status === 'unlimited' || c.status === 'unavailable') {
                    result = result.filter(v => v.id !== c.id);
                } else {
                    const sameIndex = result.findIndex(b => b.id === c.id);

                    const value: BanlistItem = {
                        date:   c.date,
                        link:   c.link ?? [],
                        id:     c.id,
                        status: c.status as Legality,
                        group:  c.group,
                    };

                    if (sameIndex === -1) {
                        result.push(value);
                    } else {
                        result.splice(sameIndex, 1, value);
                    }
                }
            }
        }

        return result;
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
                return a.id < b.id ? -1 : 1;
            }
        });
        break;
    case 'date':
        banlistItems.sort((a, b) => {
            if (a.group !== b.group) {
                return banlistSourceOrder.indexOf(a.group ?? null)
                  - banlistSourceOrder.indexOf(b.group ?? null);
            }

            if (a.date < b.date) {
                return -1;
            } else if (a.date > b.date) {
                return 1;
            }

            if (a.status !== b.status) {
                return banlistStatusOrder.indexOf(a.status)
                  - banlistStatusOrder.indexOf(b.status);
            } else {
                return a.id < b.id ? -1 : 1;
            }
        });
        break;
    default:
    }

    return banlistItems;
});

const timelineEvents = computed(() => {
    const result = [];

    for (const c of changes.value) {
        const v = result.find(r => r.date === c.date);

        if (v != null) {
            if (c.type === 'set') {
                v.color = 'cyan';
            }
        } else {
            result.push({
                date:  c.date,
                color: c.type === 'set' ? 'cyan' : 'orange',
            });
        }
    }

    return result;
});

const loadData = async () => {
    const { data: formatResult } = await apiGet<Format>('/yugioh/format', {
        id: format.value,
    });

    data.value = formatResult;

    const { data: changesResult } = await apiGet<FormatChange[]>('/yugioh/format/changes', {
        id: format.value,
    });

    changes.value = changesResult;
};

const groupShort = (group: string) => {
    switch (group) {
    case 'ante': return 'ante';
    case 'legendary': return 'leg.';
    case 'conspiracy': return 'consp.';
    case 'unfinity': return 'unf.';
    case 'offensive': return 'off.';
    default: return '';
    }
};

const toPrevDate = () => {
    const currDate = date.value ?? new Date().toISOString().split('T')[0];

    for (const { date: dateValue } of timelineEvents.value.slice().reverse()) {
        if (dateValue < currDate) {
            date.value = dateValue;
            return;
        }
    }
};

const toNextDate = () => {
    const currDate = date.value ?? new Date().toISOString().split('T')[0];

    for (const { date: dateValue } of timelineEvents.value) {
        if (dateValue > currDate) {
            date.value = dateValue;
            return;
        }
    }
};

watch(format, loadData, { immediate: true });
</script>

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
