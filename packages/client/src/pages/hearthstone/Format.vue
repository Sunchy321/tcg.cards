<template>
    <q-page class="q-pa-md">
        <div class="row items-center q-mb-lg text-h5">
            <div class="q-mr-sm">{{ $t('hearthstone.format.' + format) }}</div>
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
                    <span class="text-h6 q-mr-md">{{ n.name }}</span>
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
                    v-slot="{ setId, status }"
                    :value="n.sets" :item-width="300" item-class="flex items-center"
                >
                    <div class="sets flex items-center q-gutter-sm">
                        <q-icon
                            :name="status === 'legal' ? 'mdi-plus' : 'mdi-minus'"
                            :class="status === 'legal' ? 'color-positive' : 'color-negative'"
                        />
                        <set-avatar :id="setId" />
                    </div>
                </grid>

                <grid
                    v-if="n.banlist.length>0"
                    v-slot="{ cardId, status, group }"
                    :value="n.banlist" :item-width="300" item-key="cardId" item-class="flex items-center"
                >
                    <div class="banlist flex items-center q-gutter-sm">
                        <status-icon :status="status" />
                        <card-avatar class="avatar" :card-id="cardId" :format="format" :version="n.version" />
                        <span v-if="group != null" class="group">{{ groupShort(group) }}</span>
                    </div>
                </grid>

                <grid
                    v-if="n.adjustment.length>0"
                    v-slot="{ cardId, status, adjustment, group }"
                    :value="n.adjustment" :item-width="400" item-key="cardId" item-class="flex items-center"
                >
                    <div class="adjustment flex items-center">
                        <card-adjustment
                            class="avatar"
                            :card-id="cardId"
                            :status="status"
                            :format="format"
                            :version="n.version"
                            :last-version="n.lastVersion ?? n.version"
                            :adjustment="adjustment"
                            show-full
                        />
                        <span v-if="group != null" class="group">{{ groupShort(group) }}</span>
                    </div>
                </grid>
            </div>
        </div>

        <template v-else>
            <div v-if="sets.length > 0" class="flex q-mb-md">
                <span class="text-h6">{{ $t('hearthstone.ui.format.set') }}</span>
            </div>

            <grid
                v-if="sets.length > 0"
                v-slot="{ id }"
                :value="sets.map(id => ({ id }))" :item-width="300" item-class="flex items-center"
            >
                <set-avatar :id="id" />
            </grid>

            <div v-if="banlist.length > 0" class="flex items-center q-my-md">
                <span class="text-h6">{{ $t('hearthstone.ui.format.banlist') }}</span>

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
                v-if="banlist.length > 0"
                v-slot="{ cardId, status, date: effectiveDate, group, link }"
                :value="banlist" :item-width="300" item-key="cardId" item-class="flex items-center"
            >
                <div class="banlist flex items-center q-gutter-sm">
                    <status-icon :status="status" />
                    <a v-if="link.length > 0" class="date" :href="link[0]" target="_blank">{{ effectiveDate }}</a>
                    <div v-else class="date">{{ effectiveDate }}</div>
                    <card-avatar class="avatar" :card-id="cardId" :format="format" />
                    <span v-if="group != null" class="group">{{ groupShort(group) }}</span>
                </div>
            </grid>
        </template>
    </q-page>
</template>

<script setup lang="ts">
import {
    ref, computed, watch,
} from 'vue';

import { useI18n } from 'vue-i18n';
import { useTitle, useParam } from 'store/core';
import { useGame } from 'store/games/hearthstone';

import Grid from 'components/Grid.vue';
import DateInput from 'components/DateInput.vue';
import CardAvatar from 'components/hearthstone/CardAvatar.vue';
import CardAdjustment from 'components/hearthstone/CardAdjustment.vue';
import StatusIcon from 'components/hearthstone/StatusIcon.vue';
import SetAvatar from 'components/hearthstone/SetAvatar.vue';

import { Format } from '@model/hearthstone/schema/format';
import { FormatChange, Legality, AdjustmentType } from '@model/hearthstone/schema/game-change';

import { last, uniq } from 'lodash';

import { banlistStatusOrder, banlistSourceOrder, adjustmentStatusOrder } from '@static/hearthstone/misc';

import { trpc } from 'src/trpc';

interface BanlistItem {
    date: string;
    link: string[];

    cardId: string;
    status: Legality;
    group?: string;
}

interface TimelineNode {
    date:         string;
    name:         string;
    version:      number;
    lastVersion?: number;
    link:         string[];

    sets:    { setId: string, status: 'legal' | 'unavailable' }[];
    banlist: { cardId: string, status: Legality, group?: string }[];

    adjustment: {
        cardId:     string;
        status:     AdjustmentType;
        group?:     string;
        adjustment: {
            cardId?: string | undefined;
            detail:  { part: string, status: AdjustmentType }[];
        }[];
    }[];
}

const game = useGame();
const i18n = useI18n();

useTitle(() => i18n.t('hearthstone.format.$self'));

const formats = computed(() => game.formats);

const format = useParam('format', {
    type:    'enum',
    bind:    'params',
    key:     'id',
    inTitle: true,
    values:  formats,
    label:   (v: string) => i18n.t(`hearthstone.format.${v}`),
});

const showTimeline = useParam('timeline', {
    type:    'boolean',
    bind:    'query',
    inTitle: true,
    icon:    ['mdi-timeline-outline', 'mdi-timeline'],
});

const date = useParam('date', {
    type: 'date',
    bind: 'query',
});

const order = useParam('order', {
    type:   'enum',
    bind:   'query',
    values: ['name', 'date'] as const,
});

const data = ref<Format>();
const changes = ref<FormatChange[]>([]);

const orderOptions = ['name', 'date'].map(v => ({
    value: v,
    slot:  v,
}));

const dateFrom = computed(() => data.value?.birthday ?? game.birthday);
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

const nodes = computed(() => {
    const result: TimelineNode[] = [];

    for (const c of changes.value) {
        const node = (() => {
            const value = result.find(r => r.date === c.date);

            if (value != null) {
                return value;
            } else {
                result.push({
                    date:        c.date,
                    name:        c.name,
                    version:     c.version,
                    lastVersion: c.lastVersion ?? undefined,
                    link:        c.link ?? [],
                    sets:        [],
                    banlist:     [],
                    adjustment:  [],
                });

                return last(result)!;
            }
        })();

        if (c.type === 'set_change') {
            node.sets.push({ setId: c.setId!, status: c.status as 'legal' | 'unavailable' });
        } else if (c.type === 'card_change') {
            node.banlist.push({
                cardId: c.cardId!,
                status: c.status as Legality,
                group:  c.group ?? undefined,
            });
        } else {
            node.adjustment.push({
                cardId:     c.cardId!,
                status:     c.status as AdjustmentType,
                adjustment: c.adjustment ?? [],
                group:      c.group ?? undefined,
            });
        }
    }

    for (const v of result) {
        v.link = uniq(v.link);

        v.sets.sort((a, b) => {
            if (a.status !== b.status) {
                return a.status === 'legal' ? -1 : 1;
            } else {
                return a.setId < b.setId ? -1 : a.setId > b.setId ? 1 : 0;
            }
        });

        v.banlist.sort((a, b) => {
            if (a.status !== b.status) {
                return banlistStatusOrder.indexOf(a.status)
                  - banlistStatusOrder.indexOf(b.status);
            } else {
                return a.cardId < b.cardId ? -1 : 1;
            }
        });

        v.adjustment.sort((a, b) => {
            if (a.status !== b.status) {
                return adjustmentStatusOrder.indexOf(a.status)
                  - adjustmentStatusOrder.indexOf(b.status);
            } else {
                return a.cardId < b.cardId ? -1 : 1;
            }
        });
    }

    return result;
});

const sets = computed(() => {
    let result: string[] = [];

    for (const c of changes.value) {
        if (c.type === 'set_change') {
            if (c.date > date.value) {
                break;
            }

            if (c.status === 'legal') {
                result.push(c.setId!);
            } else {
                result = result.filter(s => s !== c.setId);
            }
        }
    }

    return result;
});

const banlist = computed(() => {
    const banlistItems = (() => {
        let result: BanlistItem[] = [];

        for (const c of changes.value) {
            if (c.type === 'card_change') {
                if (c.date > date.value) {
                    break;
                }

                if (c.status === 'legal' || c.status === 'unavailable') {
                    result = result.filter(v => v.cardId !== c.cardId);
                } else {
                    const sameIndex = result.findIndex(b => b.cardId === c.cardId);

                    const value: BanlistItem = {
                        date:   c.date,
                        link:   c.link ?? [],
                        cardId: c.cardId!,
                        status: c.status as Legality,
                        group:  c.group ?? undefined,
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
                return a.cardId < b.cardId ? -1 : 1;
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
                return a.cardId < b.cardId ? -1 : 1;
            }
        });
        break;
    default:
    }

    return banlistItems;
});

const timelineEvents = computed(() => {
    const result: { date: string, color: string }[] = [];

    for (const c of changes.value) {
        const v = result.find(r => r.date === c.date);

        if (v != null) {
            if (c.type === 'set_change') {
                v.color = 'cyan';
            }
        } else {
            result.push({
                date:  c.date,
                color: c.type === 'set_change' ? 'cyan' : 'orange',
            });
        }
    }

    return result;
});

const loadData = async () => {
    data.value = await trpc.hearthstone.format.full({
        formatId: format.value,
    });

    changes.value = await trpc.hearthstone.format.changes({
        formatId: format.value,
    });
};

const groupShort = (group: string) => {
    switch (group) {
    case 'c_thun': return 'c\'thun';
    case 'odd_even': return 'odd/even';
    default: return group;
    }
};

const toPrevDate = () => {
    const currDate = date.value ?? new Date().toISOString().split('T')[0];

    for (const { date: dateValue } of timelineEvents.value.slice().reverse()) {
        if (dateValue < currDate) {
            date.value = dateValue as string;
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

.banlist, .adjustment
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
