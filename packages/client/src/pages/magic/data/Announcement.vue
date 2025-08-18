<template>
    <div class="q-pa-md">
        <div class="flex items-center">
            <q-select
                v-model="filter"
                :options="['', ...sources]"
                outlined dense
            />

            <q-select
                v-model="selected"
                class="col-grow q-mx-sm"
                :options="announcementListWithLabel"
                emit-value
                map-options
                outlined dense
            />

            <q-btn
                icon="mdi-sync-circle"
                flat dense round
                @click="applyAnnouncements"
            />

            <q-btn
                icon="mdi-plus"
                flat dense round
                @click="newAnnouncement"
            />

            <q-btn
                icon="mdi-upload"
                flat dense round
                @click="saveAnnouncement"
            />
        </div>

        <div class="flex items-center q-pt-md">
            <q-icon
                :name="dbId == null ? 'mdi-database-remove': 'mdi-database-check'"
                :color="dbId == null ? 'red' : undefined"
                size="sm"
            />

            <q-select
                v-model="source"
                class="q-ml-md"
                :options="sources"
                outlined dense
            />
        </div>

        <div class="flex items-center q-pt-sm">
            <date-input v-model="date" outlined dense>
                <template #before>
                    <q-icon name="mdi-calendar-today" />
                </template>
            </date-input>

            <date-input v-model="nextDate" class="q-ml-md" outlined dense>
                <template #before>
                    <q-icon name="mdi-arrow-right-circle" />
                </template>
            </date-input>

            <date-input v-model="tabletopDate" class="q-ml-md" outlined dense>
                <template #before>
                    <q-icon name="mdi-cards-outline" />
                </template>
            </date-input>

            <date-input v-model="onlineDate" class="q-ml-md" outlined dense>
                <template #before>
                    <q-icon name="mdi-alpha-o-circle-outline" />
                </template>
            </date-input>

            <date-input v-model="arenaDate" class="q-ml-md" outlined dense>
                <template #before>
                    <q-icon name="mdi-alpha-a-circle-outline" />
                </template>
            </date-input>
        </div>

        <list
            v-model="links"
            class="q-mt-md"
            item-class="q-mt-sm"
            @insert="links = [...links, '']"
        >
            <template #title>
                <q-icon name="mdi-link" size="sm" />
            </template>

            <template #summary="{ value, update }">
                <q-input
                    class="col-grow"
                    outlined dense
                    :model-value="value"
                    @update:model-value="(update as any)"
                />
            </template>
        </list>

        <list
            v-model="groupedItems"
            class="change-list q-mt-md"
            item-class="change q-mt-sm q-pa-sm"
            @insert="pushItem"
        >
            <template #title>
                <q-icon name="mdi-text-box-outline" size="sm" />
            </template>
            <template #summary="{ value: c }">
                <q-select v-model="c.range" multiple class="col-grow" :options="formats" outlined dense />
            </template>
            <template #body="{ value: g }">
                <list
                    class="q-mt-sm"
                    item-class="q-mt-sm"
                    :model-value="g.items"
                    @update:model-value="b => updateItem(g.range, b)"
                    @insert="() => pushItem(g.range)"
                >
                    <template #title>
                        <q-icon name="mdi-card-bulleted-outline" size="sm" />
                    </template>
                    <template #summary="{ value: c }">
                        <q-btn
                            class="q-mr-sm"
                            :icon="gameChangeTypeIcon(c.type)"
                            flat dense round
                            @click="switchChangeType(c)"
                        />

                        <q-input
                            v-if="c.type === 'card_change' || c.type === 'set_change' || c.type === 'rule_change'"
                            class="col-grow q-mr-sm"
                            :model-value="getId(c)"
                            outlined dense
                            @update:model-value="v => updateId(c, v as string)"
                        />

                        <q-btn-toggle
                            v-if="c.type === 'card_change' || c.type === 'set_change'"
                            v-model="c.status"
                            :options="getStatusOptions(c)"
                            flat dense
                            :toggle-color="undefined"
                            color="white"
                            text-color="grey"
                        />

                        <q-input
                            v-if="c.type === 'card_change'"
                            class="q-ml-sm score-input"
                            type="number"
                            :model-value="scoreFor(c)"
                            min="0" max="15"
                            flat dense outlined
                            @update:model-value="v => updateScoreFor(c, v as number)"
                        >
                            <template #prepend>
                                <q-icon name="mdi-counter" />
                            </template>
                        </q-input>
                    </template>
                </list>
            </template>
        </list>
    </div>
</template>

<script setup lang="ts">
import {
    ref, computed, watch, onMounted, toRaw,
} from 'vue';

import { useParam } from 'store/core';
import { useGame } from 'store/games/magic';

import List from 'components/List.vue';
import DateInput from 'components/DateInput.vue';

import { GameChangeType, Legality } from '@model/magic/schema/game-change';

import _ from 'lodash';

import { toIdentifier } from '@common/util/id';
import { getValue, trpc } from 'src/hono';
import { Announcement, AnnouncementItem, AnnouncementProfile } from '@model/magic/schema/announcement';

const sources = [
    'release',
    'wotc',
    'duelcommander',
    'mtgcommander',
    'leviathan_commander',
    'oathbreaker',
    'canadian_highlander',
    'pauper_commander',
    'initial',
    'rotation',
];

const gameChangeTypeIcon = (type: GameChangeType) => {
    switch (type) {
    case 'card_change':
        return 'mdi-card-account-details-outline';
    case 'set_change':
        return 'mdi-package-variant-closed';
    case 'rule_change':
        return 'mdi-format-list-bulleted-type';
    case 'format_death':
        return 'mdi-skull-outline';
    default:
        return '';
    }
};

const statusIcon = (status: string, card?: string) => {
    switch (status) {
    case 'banned':
        return 'mdi-close-circle-outline';
    case 'banned_in_bo1':
        return 'mdi-progress-close';
    case 'suspended':
        return 'mdi-minus-circle-outline';
    case 'banned_as_commander':
        return 'mdi-crown-circle-outline';
    case 'banned_as_companion':
        return 'mdi-heart-circle-outline';
    case 'game_changer':
        return 'mdi-eye-circle-outline';
    case 'restricted':
        return 'mdi-alert-circle-outline';
    case 'legal':
        return 'mdi-check-circle-outline';
    case 'unavailable':
        return 'mdi-cancel';
    case undefined:
        if (card?.startsWith('#{clone:')) {
            return 'mdi-content-copy';
        } else {
            return 'mdi-help-circle-outline';
        }
    default:
        return '';
    }
};

const statusOptions = [
    'legal',
    'banned',
    'banned_in_bo1',
    'suspended',
    'restricted',
    'banned_as_commander',
    'banned_as_companion',
    'game_changer',
    'unavailable',
].map(v => ({
    icon:  statusIcon(v),
    class: `banlist-status-${v}`,
    value: v,
}));

const game = useGame();

const filter = useParam('filter', {
    type:    'enum',
    bind:    'query',
    values:  ['', ...sources],
    default: '',
});

const formats = computed(() => ['#standard', '#alchemy', ...game.formats]);
const announcementList = ref<AnnouncementProfile[]>([]);
const selected = ref<AnnouncementProfile | null>(null);

const announcement = ref<Announcement>({
    id: '',

    source: '',
    date:   '',
    name:   '',

    effectiveDate:         null,
    effectiveDateTabletop: null,
    effectiveDateOnline:   null,
    effectiveDateArena:    null,

    nextDate: null,

    links: [],
    items: [],
});

const announcementFiltered = computed(() => {
    let list = announcementList.value;

    if (filter.value !== '') {
        list = list.filter(a => a.source === filter.value);
    }

    return list;
});

const announcementListWithLabel = computed(() => announcementFiltered.value.map(a => ({
    value: a,
    label: a.name,
})));

const dbId = computed(() => announcement.value.id === '' ? null : announcement.value.id);

const source = computed({
    get() { return announcement.value?.source ?? 'wotc'; },
    set(newValue: string) {
        announcement.value.source = newValue;
    },
});

const date = computed({
    get() { return announcement.value?.date ?? ''; },
    set(newValue: string) {
        announcement.value.date = newValue;
    },
});

const nextDate = computed({
    get() { return announcement.value?.nextDate ?? ''; },
    set(newValue: string) {
        if (newValue === '') {
            announcement.value.nextDate = null;
        } else {
            announcement.value.nextDate = newValue;
        }
    },
});

const effectiveDate = (index: 'tabletop' | 'online' | 'arena') => {
    const key = `effectiveDate${_.capitalize(index)}` as const;

    return computed({
        get() { return announcement.value?.[key] ?? ''; },
        set(newValue: string) {
            if (newValue === '') {
                announcement.value[key] = null;
            } else {
                announcement.value[key] = newValue;
            }
        },
    });
};

const tabletopDate = effectiveDate('tabletop');
const onlineDate = effectiveDate('online');
const arenaDate = effectiveDate('arena');

const links = computed({
    get() { return announcement.value.links; },
    set(newValue: string[]) { announcement.value.links = newValue; },
});

const items = computed({
    get() { return announcement.value.items; },
    set(newValue: Announcement['items']) {
        announcement.value.items = newValue;
    },
});

const groupedItems = computed(() => {
    const groups: {
        range: AnnouncementItem['range'];
        items: AnnouncementItem[];
    }[] = [];

    for (const item of items.value) {
        const group = groups.find(g => _.isEqual(g.range, item.range));

        if (group == null) {
            groups.push({
                range: item.range,
                items: [item],
            });
        } else {
            group.items.push(item);
        }
    }

    return groups;
});

const pushItem = (range: string[] | null = []) => {
    console.log('pushItem', range);

    items.value.push({
        type:          'card_change',
        effectiveDate: null,
        range,

        cardId: null,
        setId:  null,
        ruleId: null,

        status: null,

        adjustment:   null,
        relatedCards: null,
    });
};

const updateItem = (range: AnnouncementItem['range'], newItems: AnnouncementItem[]) => {
    const oldItems = items.value.filter(item => !_.isEqual(item.range, range));
    const insertPoint = items.value.findIndex(item => _.isEqual(item.range, range));

    if (insertPoint >= 0) {
        // Insert new items at the position of the first matching item
        const result = [...oldItems.slice(0, insertPoint), ...newItems, ...oldItems.slice(insertPoint)];
        items.value = result;
    } else {
        // If no matching items were found, just append the new items
        items.value = [...oldItems, ...newItems];
    }
};

const getId = (item: AnnouncementItem) => {
    if (item.type === 'card_change') {
        return item.cardId;
    } else if (item.type === 'set_change') {
        return item.setId;
    } else if (item.type === 'rule_change') {
        return item.ruleId;
    } else {
        return '';
    }
};

const getStatusOptions = (item: AnnouncementItem) => {
    if (item.type === 'card_change') {
        return statusOptions;
    } else if (item.type === 'set_change') {
        return statusOptions.filter(v => v.value === 'legal' || v.value === 'banned');
    } else {
        return [];
    }
};

const adjustId = (id: string) => (id.startsWith('#') ? id : toIdentifier(id));

const updateId = (item: AnnouncementItem, id: string) => {
    if (item.type === 'card_change') {
        item.cardId = adjustId(id);
    } else if (item.type === 'set_change') {
        item.setId = adjustId(id);
    } else if (item.type === 'rule_change') {
        item.ruleId = id;
    }
};

const switchChangeType = (item: AnnouncementItem) => {
    if (item.type === 'card_change') {
        item.type = 'set_change';
    } else if (item.type === 'set_change') {
        item.type = 'rule_change';
    } else if (item.type === 'rule_change') {
        item.type = 'format_death';
    } else if (item.type === 'format_death') {
        item.type = 'card_change';
    }
};

const scoreFor = (item: AnnouncementItem) => {
    if (item.status != null && item.status.startsWith('score-')) {
        return Number.parseInt(item.status.slice('score-'.length), 10);
    } else {
        return 0;
    }
};

const updateScoreFor = (item: AnnouncementItem, value: number | string) => {
    if (item.type != 'card_change') {
        return;
    }

    value = typeof value === 'string' ? Number.parseInt(value, 10) : value;

    if (value === 0) {
        item.status = 'legal';
    } else {
        item.status = `score-${value}` as Legality;
    }
};

const formatMap: Record<string, string> = {
    release:             '#standard',
    duelcommander:       'duelcommander',
    mtgcommander:        'commander',
    leviathan_commander: 'leviathan_commander',
    oathbreaker:         'oathbreaker',
    canadian_highlander: 'canadian_highlander',
    pauper_commander:    'pauper_commander',
};

const fillEmptyAnnouncement = () => {
    if (items.value.length !== 0) {
        return;
    }

    const format = formatMap[source.value];

    if (format == null) {
        return;
    }

    pushItem([format]);
};

watch(source, fillEmptyAnnouncement);

const loadData = async () => {
    const value = await getValue(trpc.magic.announcement.list, {});

    if (value != null) {
        announcementList.value = value;
    } else {
        announcementList.value = [];
    }

    if (announcementFiltered.value.length > 0 && selected.value == null) {
        selected.value = announcementFiltered.value[0];
    }
};

onMounted(loadData);

const loadAnnouncement = async () => {
    if (selected.value?.id == null) {
        return;
    }

    const value = await getValue(trpc.magic.announcement.full, {
        id: selected.value.id,
    });

    if (value != null) {
        announcement.value = value as Announcement & { id?: string };
    }
};

watch(selected, loadAnnouncement);

const saveAnnouncement = async () => {
    if (announcement.value == null) {
        return;
    }

    const data = toRaw(announcement.value);

    data.name = `${data.source} - ${data.date}`;

    for (const c of data.items) {
        if (c.type === 'card_change') {
            c.setId = null;
            c.ruleId = null;
        } else if (c.type === 'set_change') {
            c.cardId = null;
            c.ruleId = null;
        } else if (c.type === 'rule_change') {
            c.cardId = null;
            c.setId = null;
        } else {
            c.cardId = null;
            c.setId = null;
            c.ruleId = null;
        }
    }

    await trpc.magic.announcement.save.$post({
        json: data,
    });

    await loadData();
};

const newAnnouncement = async () => {
    await saveAnnouncement();

    const todayDate = new Date().toISOString().split('T')[0];

    selected.value = null;

    announcement.value = {
        id: '',

        source: filter.value === '' ? 'wotc' : filter.value,
        date:   todayDate,
        name:   '',

        effectiveDate:         null,
        effectiveDateTabletop: null,
        effectiveDateOnline:   null,
        effectiveDateArena:    null,

        nextDate: null,

        links: [],
        items: [],
    };

    fillEmptyAnnouncement();
};

const applyAnnouncements = async () => {
    await saveAnnouncement();

    await trpc.magic.announcement.apply.$post();
};

</script>

<style lang="sass" scoped>

.change-list :deep(.change)
    border: 1px grey solid
    border-radius: 5px

.score-input
    width: 150px

</style>
