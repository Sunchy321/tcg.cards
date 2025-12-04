<template>
    <div class="q-pa-md">
        <div class="flex items-center">
            <q-select
                v-model="selected"
                class="col-grow q-mr-sm"
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

            <date-input v-model="date" class="q-ml-md" outlined dense>
                <template #before>
                    <q-icon name="mdi-calendar-today" />
                </template>
            </date-input>

            <date-input v-model="effectiveDate" class="q-ml-md" outlined dense>
                <template #before>
                    <q-icon name="mdi-cards-outline" />
                </template>
            </date-input>

            <q-input v-model="name" class="q-ml-md" outlined dense>
                <template #before>
                    <q-icon name="mdi-account-outline" />
                </template>
            </q-input>

            <q-space />

            <q-input v-model.number="lastVersion" outlined dense clearable type="number">
                <template #before>
                    <q-icon name="mdi-history" />
                </template>
            </q-input>

            <q-input v-model.number="version" class="q-ml-md" outlined dense type="number">
                <template #before>
                    <q-icon name="mdi-cards-outline" />
                </template>
            </q-input>
        </div>

        <list
            v-model="link"
            class="q-mt-md"
            item-class="q-mt-sm"
            @insert="link = [...link, '']"
        >
            <template #title>
                <q-icon name="mdi-link" size="sm" />
            </template>

            <template #summary="{ value, update }">
                <q-input
                    class="col-grow"
                    outlined dense
                    :model-value="value"
                    @update:model-value="v => update(v as string)"
                />
            </template>
        </list>

        <list v-model="groupedItems" class="change-list q-mt-md" item-class="change q-mt-sm q-pa-sm" @insert="pushItem">
            <template #title>
                <q-icon name="mdi-text-box-outline" size="sm" />
            </template>
            <template #summary="{ value: c }">
                <q-select
                    class="col-grow" :options="formats" outlined dense
                    :model-value="c.format"
                    @update:model-value="v=> updateFormat(c.format, v)"
                />
            </template>
            <template #body="{ value: g }">
                <list
                    class="q-mt-sm" item-class="q-mt-sm" :model-value="g.items"
                    @update:model-value="b => updateItem(g.format, b)" @insert="() => pushItem(g.format)"
                >
                    <template #title>
                        <q-icon name="mdi-card-bulleted-outline" size="sm" />
                    </template>
                    <template #summary="{ value: c }">
                        <q-btn
                            class="q-mr-sm" :icon="gameChangeTypeIcon(c.type)" flat dense round
                            @click="switchChangeType(c)"
                        >
                            <q-tooltip>{{ c.type }}</q-tooltip>
                        </q-btn>

                        <card-input
                            v-if="c.type === 'card_change' || c.type === 'card_adjustment'"
                            class="col-grow q-mr-sm" outlined dense
                            :format="c.format ?? undefined"
                            :model-value="getId(c)"
                            :version="version"
                            @update:model-value="v => updateId(c, v as string)"
                            @paste-multi="lines => onPasteMulti(c, lines)"
                        />

                        <q-input
                            v-else-if="c.type=== 'set_change' || c.type === 'rule_change'"
                            class="col-grow q-mr-sm" outlined dense
                            :model-value="getId(c)"
                            @update:model-value="v => updateId(c, v as string)"
                        />

                        <template v-if="c.type === 'card_adjustment'">
                            <q-btn
                                class="q-mr-sm"
                                icon="mdi-cards-outline"
                                flat round dense
                                @click="() => addRelated(c)"
                            />

                            <q-btn
                                class="q-mr-sm"
                                icon="mdi-calculator"
                                flat dense round
                                @click="calcStatus(c)"
                            />

                            <q-btn
                                class="q-mr-sm"
                                icon="mdi-plus"
                                flat round dense
                                @click="() => addDetail(c)"
                            />

                            <q-chip
                                v-for="(d, i) of c.adjustment"
                                :key="d.part"
                                class="flex items-center q-mr-sm"
                                square removable
                                :icon="statusIcon(d.status)"
                                :color="statusColor(d.status)"
                                text-color="white"
                                :clickable="d.part === 'text' || d.part === 'rune'"
                                @click="d.status = nextStatus(d.status)"
                                @remove="c.adjustment!.splice(i, 1)"
                            >
                                {{ d.part }}
                            </q-chip>
                        </template>

                        <q-btn-toggle
                            v-if="c.type === 'card_change' || c.type === 'set_change' || c.type === 'card_adjustment'" v-model="c.status"
                            :options="getStatusOptions(c)" flat dense :toggle-color="undefined" color="white"
                            text-color="grey"
                        />

                        <q-input
                            v-if="c.type === 'card_change'" class="q-ml-sm score-input" type="number"
                            :model-value="scoreFor(c)" min="0" max="15" flat dense outlined
                            @update:model-value="v => updateScoreFor(c, v as number)"
                        >
                            <template #prepend>
                                <q-icon name="mdi-counter" />
                            </template>
                        </q-input>
                    </template>
                    <template #body="{ value: c }">
                        <div v-if="c.relatedCards != null && c.relatedCards.length > 0" class="flex items-center q-mt-sm">
                            <q-icon name="mdi-cards-outline" size="sm" />

                            <card-input
                                v-for="(r, i) in c.relatedCards" :key="i"
                                class="col-grow q-ml-sm"
                                outlined dense
                                :format="c.format ?? undefined"
                                :model-value="r"
                                :version="version"
                                @update:model-value="v => c.relatedCards![i] = v"
                            >
                                <template #append>
                                    <q-btn
                                        icon="mdi-minus"
                                        flat round dense
                                        @click="c.relatedCards.splice(i, 1)"
                                    />
                                </template>
                            </card-input>
                        </div>
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

import { useQuasar } from 'quasar';
import { useGame } from 'store/games/hearthstone';

import List from 'components/List.vue';
import DateInput from 'components/DateInput.vue';
import CardInput from 'components/hearthstone/data/CardInput.vue';

import { Announcement, AnnouncementItem, AnnouncementProfile } from '@model/hearthstone/schema/announcement';
import { GameChangeType } from '@model/hearthstone/schema/game-change';
import { CardEntityView } from '@model/hearthstone/schema/entity';

import { isEqual } from 'lodash';

import { trpc } from 'src/trpc';

type EntityNumberKey = {
    [K in keyof Required<CardEntityView>]: Required<CardEntityView>[K] extends number | null ? K : never;
}[keyof CardEntityView];

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
    case 'card_adjustment':
        return 'mdi-credit-card-edit';
    default:
        return '';
    }
};

const statusIcon = (status: string) => {
    switch (status) {
    case 'banned':
        return 'mdi-close-circle-outline';
    case 'legal':
        return 'mdi-check-circle-outline';
    case 'banned_in_deck':
        return 'mdi-minus-circle-outline';
    case 'banned_in_card_pool':
        return 'mdi-star-circle-outline';
    case 'unavailable':
        return 'mdi-cancel';
    case 'nerf':
        return 'mdi-arrow-down-thin-circle-outline';
    case 'buff':
        return 'mdi-arrow-up-thin-circle-outline';
    case 'adjust':
        return 'mdi-asterisk-circle-outline';
    default:
        return '';
    }
};

const statusColor = (status: string) => {
    switch (status) {
    case 'buff':
        return 'positive';
    case 'nerf':
        return 'negative';
    case 'adjust':
        return 'warning';
    default:
        return 'grey';
    }
};

const statusOptions = [
    'legal', 'banned', 'banned_in_deck', 'banned_in_card_pool', 'unavailable',
].map(v => ({
    icon:  statusIcon(v),
    class: `banlist-status-${v}`,
    value: v,
}));

const adjustOptions = ['nerf', 'buff', 'adjust'].map(v => ({
    icon:  statusIcon(v),
    class: `banlist-status-${v}`,
    value: v,
}));

const { dialog } = useQuasar();
const game = useGame();

const formats = computed(() => ['#hearthstone', ...game.formats]);
const announcementList = ref<AnnouncementProfile[]>([]);
const selected = ref<AnnouncementProfile>();

const announcement = ref<Announcement>({
    id:            '',
    source:        'blizzard',
    date:          '',
    effectiveDate: '',
    name:          '',
    link:          [],
    version:       0,
    lastVersion:   null,
    items:         [],
});

const announcementListWithLabel = computed(() => announcementList.value.map(a => ({
    value: a,
    label: `${a.name} [${a.date}] - ${a.source}`,
})));

const dbId = computed(() => announcement.value.id === '' ? null : announcement.value.id);

const date = computed({
    get() { return announcement.value?.date ?? ''; },
    set(newValue: string) {
        announcement.value.date = newValue;
    },
});

const effectiveDate = computed({
    get() { return announcement.value?.effectiveDate ?? ''; },
    set(newValue: string) {
        announcement.value.effectiveDate = newValue;
    },
});

const name = computed({
    get() { return announcement.value?.name ?? ''; },
    set(newValue: string) {
        announcement.value.name = newValue;
    },
});

const version = computed({
    get() { return announcement.value?.version; },
    set(newValue: number) {
        announcement.value.version = newValue;
    },
});

const lastVersion = computed({
    get() { return announcement.value?.lastVersion; },
    set(newValue: number | null | undefined) {
        announcement.value.lastVersion = newValue ?? null;
    },
});

const link = computed({
    get() { return announcement.value?.link ?? []; },
    set(newValue: string[]) { announcement.value.link = newValue; },
});

const items = computed({
    get() { return announcement.value.items; },
    set(newValue: Announcement['items']) {
        announcement.value.items = newValue;
    },
});

const groupedItems = computed({
    get() {
        const map = new Map<string | null, Announcement['items']>();

        for (const item of announcement.value.items) {
            if (!map.has(item.format)) {
                map.set(item.format, []);
            }

            map.get(item.format)!.push(item);
        }

        return [...map.entries()].map(([format, items]) => ({ format, items }));
    },
    set(newValue) {
        announcement.value.items = newValue.flatMap(group => group.items);
    },
});

const updateFormat = (oldFormat: string | null, newFormat: string | null) => {
    for (const item of announcement.value.items) {
        if (item.format === oldFormat) {
            item.format = newFormat;
        }
    }
};

const pushItem = (format: string | null = '') => {
    const lastItem = groupedItems.value
        ?.find(g => g.format === format)
        ?.items
        ?.slice(-1)?.[0];

    const type = lastItem?.type ?? 'card_change';
    const status = lastItem?.status ?? null;

    items.value.push({
        type,
        effectiveDate: null,
        format,

        cardId: null,
        setId:  null,
        ruleId: null,

        status,
        score: null,

        adjustment:   null,
        relatedCards: null,
    });
};

const updateItem = (format: AnnouncementItem['format'], newItems: AnnouncementItem[]) => {
    const oldItems = items.value.filter(item => item.format != format);
    const insertPoint = items.value.findIndex(item => item.format == format);

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
    if (item.type === 'card_change' || item.type === 'card_adjustment') {
        return item.cardId!;
    } else if (item.type === 'set_change') {
        return item.setId!;
    } else if (item.type === 'rule_change') {
        return item.ruleId!;
    } else {
        return '';
    }
};

const getStatusOptions = (item: AnnouncementItem) => {
    if (item.type === 'card_change') {
        return statusOptions;
    } else if (item.type === 'set_change') {
        return statusOptions.filter(v => v.value === 'legal' || v.value === 'unavailable');
    } else if (item.type === 'card_adjustment') {
        return adjustOptions;
    } else {
        return [];
    }
};

const adjustId = (id: string) => (id);

const updateId = (item: AnnouncementItem, id: string) => {
    if (item.type === 'card_change' || item.type === 'card_adjustment') {
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
        item.type = 'card_adjustment';
    } else if (item.type === 'card_adjustment') {
        item.type = 'format_death';
    } else if (item.type === 'format_death') {
        item.type = 'card_change';
    }
};

const scoreFor = (item: AnnouncementItem) => {
    if (item.status == 'score') {
        return item.score!;
    } else {
        return 0;
    }
};

const updateScoreFor = (item: AnnouncementItem, score: number | string) => {
    if (item.type != 'card_change') {
        return;
    }

    score = typeof score === 'string' ? Number.parseInt(score, 10) : score;

    if (score === 0) {
        item.status = 'legal';
    } else {
        item.status = 'score';
        item.score = score;
    }
};

const getStatus = (oldValue: number, newValue: number, prefer: 'greater' | 'lesser') => {
    if (oldValue == null || newValue == null || oldValue === newValue) {
        return null;
    }

    if (prefer === 'greater') {
        return newValue > oldValue ? 'buff' : 'nerf';
    } else {
        return newValue > oldValue ? 'nerf' : 'buff';
    }
};

const pushDetail = <K extends EntityNumberKey>(
    array:  NonNullable<AnnouncementItem['adjustment']>,
    key: K,
    oldValue: CardEntityView,
    newValue: CardEntityView,
    prefer: 'greater' | 'lesser',
) => {
    const oldField = oldValue[key];
    const newField = newValue[key];

    const value = getStatus(oldField ?? 0, newField ?? 0, prefer);

    if (value != null) {
        array.push({ part: key, status: value });
    }
};

const nextStatus = (status: 'adjust' | 'buff' | 'nerf') => {
    switch (status) {
    case 'nerf': return 'buff';
    case 'buff': return 'adjust';
    default: return 'nerf';
    }
};

const addDetail = (c: AnnouncementItem) => {
    if (c.type != 'card_adjustment') {
        return;
    }

    dialog({
        title:  'Part',
        prompt: {
            model: '',
        },
        cancel:     true,
        persistent: true,
    }).onOk(part => {
        dialog({
            title:   'Status',
            options: {
                type:  'radio',
                model: 'nerf',
                items: [
                    { label: 'Nerf', value: 'nerf', color: 'negative' },
                    { label: 'Buff', value: 'buff', color: 'positive' },
                    { label: 'Adjust', value: 'adjust', color: 'warning' },
                ],
            },
            cancel:     true,
            persistent: true,
        }).onOk(status => {
            c.adjustment ??= [];

            c.adjustment.push({ part, status });
        });
    });
};

const calcStatus = async (c: AnnouncementItem) => {
    if (lastVersion.value == null || c.cardId == null || c.cardId === '' || c.type !== 'card_adjustment') {
        return;
    }

    const oldData = await trpc.hearthstone.card.summary({
        cardId:  c.cardId,
        lang:    'en',
        version: lastVersion.value,
    });

    const newData = await trpc.hearthstone.card.summary({
        cardId:  c.cardId,
        lang:    'en',
        version: version.value,
    });

    const newDetail: AnnouncementItem['adjustment'] = [];

    pushDetail(newDetail, 'cost', oldData, newData, 'lesser');
    pushDetail(newDetail, 'attack', oldData, newData, 'greater');
    pushDetail(newDetail, 'health', oldData, newData, 'greater');
    pushDetail(newDetail, 'durability', oldData, newData, 'greater');
    pushDetail(newDetail, 'armor', oldData, newData, 'greater');
    pushDetail(newDetail, 'techLevel', oldData, newData, 'lesser');
    pushDetail(newDetail, 'armorBucket', oldData, newData, 'greater');
    pushDetail(newDetail, 'colddown', oldData, newData, 'lesser');

    const oldLoc = oldData.localization;
    const newLoc = newData.localization;

    if (oldLoc.text !== newLoc.text) {
        newDetail.push({ part: 'text', status: 'adjust' });
    }

    if (!isEqual(oldData.race, newData.race)) {
        newDetail.push({ part: 'race', status: 'adjust' });
    }

    if (oldData.spellSchool !== newData.spellSchool) {
        newDetail.push({ part: 'school', status: 'adjust' });
    }

    if (!isEqual(oldData.rune, newData.rune)) {
        newDetail.push({ part: 'rune', status: 'adjust' });
    }

    const rarities = ['common', 'rare', 'epic', 'legendary'];

    const oldRarity = rarities.indexOf(oldData.rarity ?? '');
    const newRarity = rarities.indexOf(newData.rarity ?? '');

    if (oldRarity !== -1 && newRarity !== -1) {
        if (newRarity > oldRarity) {
            newDetail.push({ part: 'rarity', status: 'nerf' });
        } else if (newRarity < oldRarity) {
            newDetail.push({ part: 'rarity', status: 'buff' });
        }
    }

    c.adjustment = newDetail;

    if (newDetail.length > 0) {
        if (newDetail.every(d => d.status === 'nerf')) {
            c.status = 'nerf';
        } else if (newDetail.every(d => d.status === 'buff')) {
            c.status = 'buff';
        } else {
            const techLevel = newDetail.find(v => v.part === 'techLevel');

            if (techLevel != null) {
                c.status = techLevel.status;
            } else {
                c.status = 'adjust';
            }
        }
    }
};

const addRelated = (item: AnnouncementItem) => {
    item.relatedCards ??= [];

    item.relatedCards.push('');
};

const onPasteMulti = (currentItem: AnnouncementItem, lines: string[]) => {
    updateId(currentItem, lines[0]);

    const currentIndex = items.value.indexOf(currentItem);

    if (currentIndex === -1) {
        return;
    }

    const newItems: AnnouncementItem[] = lines.slice(1).map(line => ({
        type:          currentItem.type,
        effectiveDate: currentItem.effectiveDate,
        format:        currentItem.format,
        cardId:        currentItem.type === 'card_change' || currentItem.type === 'card_adjustment' ? line : null,
        setId:         currentItem.type === 'set_change' ? line : null,
        ruleId:        currentItem.type === 'rule_change' ? line : null,
        status:        currentItem.status,
        score:         currentItem.score,
        adjustment:    currentItem.type === 'card_adjustment' ? [] : null,
        relatedCards:  null,
    }));

    items.value.splice(currentIndex + 1, 0, ...newItems);
};

const loadData = async () => {
    announcementList.value = await trpc.hearthstone.announcement.list();

    if (announcementList.value.length > 0 && selected.value == null) {
        selected.value = announcementList.value[0];
    }
};

const loadAnnouncement = async () => {
    if (selected.value?.id == null) {
        return;
    }

    announcement.value = await trpc.hearthstone.announcement.full({
        id: selected.value.id,
    });
};

const saveAnnouncement = async () => {
    if (announcement.value == null) {
        return;
    }

    const data = toRaw(announcement.value);

    if (data.effectiveDate === '') {
        data.effectiveDate = null;
    }

    for (const c of data.items) {
        if (c.type === 'card_change' || c.type === 'card_adjustment') {
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

    await trpc.hearthstone.announcement.save(data);

    await loadData();
};

const newAnnouncement = async () => {
    await saveAnnouncement();

    const todayDate = new Date().toISOString().split('T')[0];

    selected.value = undefined;

    announcement.value = {
        id:            '',
        source:        'blizzard',
        date:          todayDate,
        effectiveDate: todayDate,
        name:          '',
        link:          [],
        version:       0,
        lastVersion:   null,
        items:         [],
    };
};

const applyAnnouncements = async () => {
    await saveAnnouncement();

    await trpc.hearthstone.announcement.apply();
};

watch(selected, loadAnnouncement);
onMounted(loadData);

</script>

<style lang="sass" scoped>

.change-list :deep(.change)
    border: 1px grey solid
    border-radius: 5px

</style>
