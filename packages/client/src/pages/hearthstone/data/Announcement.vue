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

            <q-space />

            <q-input v-model="lastVersion" outlined dense clearable>
                <template #before>
                    <q-icon name="mdi-history" />
                </template>
            </q-input>

            <q-input v-model="version" class="q-ml-md" outlined dense>
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
                    @update:model-value="update"
                />
            </template>
        </list>

        <list
            v-model="changes"
            class="change-list q-mt-md"
            item-class="change q-mt-sm q-pa-sm"
            @insert="changes = [...changes, { format: '', setIn: [], setOut: [], banlist: [] }]"
        >
            <template #title>
                <q-icon name="mdi-text-box-outline" size="sm" />
            </template>
            <template #summary="{ value: c }">
                <q-select v-model="c.format" class="col-grow" :options="modes" outlined dense />
            </template>
            <template #body="{ value: c }">
                <div class="flex q-mt-sm">
                    <array-input
                        class="col-grow"
                        :model-value="c.setIn ?? []"
                        outlined dense
                        @update:model-value="v => c.setIn = v"
                    >
                        <template #prepend>
                            <q-icon name="mdi-plus" />
                        </template>
                    </array-input>

                    <array-input
                        class="col-grow q-ml-sm"
                        :model-value="c.setOut ?? []"
                        outlined dense
                        @update:model-value="v => c.setOut = v"
                    >
                        <template #prepend>
                            <q-icon name="mdi-minus" />
                        </template>
                    </array-input>
                </div>

                <list
                    class="q-mt-sm"
                    item-class="q-mt-sm"
                    :model-value="c.banlist ?? []"
                    @update:model-value="b => c.banlist = b"
                    @insert="c.banlist = addBanlist(c.banlist ?? [])"
                >
                    <template #title>
                        <q-icon name="mdi-card-bulleted-outline" size="sm" />
                    </template>
                    <template #summary="{ value: b }">
                        <entity-input
                            v-model="b.id"
                            class="col-grow q-mr-sm"
                            :version="version"
                            outlined dense
                        />
                        <q-btn-toggle
                            v-model="b.status"
                            :options="banlistOptions"
                            flat dense
                            :toggle-color="undefined"
                            color="white"
                            text-color="grey"
                        />
                    </template>
                </list>

                <list
                    class="q-mt-sm"
                    item-class="q-mt-sm"
                    :model-value="c.adjustment ?? []"
                    @update:model-value="a => c.adjustment = a"
                    @insert="c.adjustment = addAdjustment(c.adjustment)"
                >
                    <template #title>
                        <q-icon name="mdi-compare" size="sm" />
                    </template>
                    <template #summary="{ value: a }">
                        <entity-input
                            v-model="a.id"
                            class="col-grow q-mr-sm"
                            :version="version"
                            outlined dense
                        />

                        <q-btn
                            class="q-mr-sm"
                            icon="mdi-calculator"
                            flat dense round
                            @click="calcStatus(a)"
                        />

                        <q-btn
                            class="q-mr-sm"
                            icon="mdi-plus"
                            flat round dense
                            @click="() => addEntity(a)"
                        />

                        <q-chip
                            v-for="d of a.detail" :key="d.part"
                            class="flex items-center q-mr-sm"
                            square
                            :icon="statusIcon(d.status)"
                            :color="statusColor(d.status)"
                            text-color="white"
                            :clickable="d.part === 'text'"
                            @click="d.status = nextStatus(d.status)"
                        >{{ d.part }}</q-chip>

                        <q-btn-toggle
                            v-model="a.status"
                            :options="adjustOptions"
                            flat dense
                            :toggle-color="undefined"
                            color="white"
                            text-color="grey"
                        />
                    </template>
                    <template #body="{ value: a }">
                        <div v-if="a.related?.length > 0" class="flex items-center q-mt-sm">
                            <q-icon name="mdi-cards-outline" size="sm" />

                            <entity-input
                                v-for="(r, i) in a.related" :key="i"
                                class="col-grow q-ml-sm"
                                :version="version"
                                outlined dense
                                :model-value="r"
                                @update:model-value="v => a.related[i] = v"
                            />
                        </div>
                    </template>
                </list>
            </template>
        </list>
    </div>
</template>

<style lang="sass" scoped>

.change-list :deep(.change)
    border: 1px grey solid
    border-radius: 5px

</style>

<script lang="ts">
import {
    defineComponent, ref, computed, watch, onMounted, toRaw,
} from 'vue';

import { useHearthstone } from 'store/games/hearthstone';

import controlSetup from 'setup/control';

import List from 'components/List.vue';
import ArrayInput from 'components/ArrayInput.vue';
import DateInput from 'components/DateInput.vue';
import EntityInput from 'src/components/hearthstone/data/EntityInput.vue';

import { Entity } from 'interface/hearthstone/entity';
import { FormatAnnouncement } from 'interface/hearthstone/format-change';

import { last } from 'lodash';
import { apiGet } from 'src/boot/backend';

type EntityNumberKey = {
    [K in keyof Required<Entity>]: Required<Entity>[K] extends number ? K : never;
}[keyof Entity];

type Banlist = Required<FormatAnnouncement['changes'][0]>['banlist'][0];
type Adjustment = Required<FormatAnnouncement['changes'][0]>['adjustment'][0];

interface FormatAnnouncementProfile {
    id?: string;
    source: string;
    date: string;
}

const statusIcon = (status: string) => {
    switch (status) {
    case 'banned':
        return 'mdi-close-circle-outline';
    case 'legal':
        return 'mdi-check-circle-outline';
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

const banlistOptions = ['legal', 'banned', 'unavailable'].map(v => ({
    icon:  statusIcon(v),
    class: `banlist-status-${v}`,
    value: v,
}));

const adjustOptions = ['nerf', 'buff', 'adjust'].map(v => ({
    icon:  statusIcon(v),
    class: `banlist-status-${v}`,
    value: v,
}));

export default defineComponent({
    name: 'DataAnnouncement',

    components: {
        ArrayInput,
        DateInput,
        List,
        EntityInput,
    },

    setup() {
        const hearthstone = useHearthstone();

        const { controlGet, controlPost } = controlSetup();

        const modes = computed(() => ['#standard', ...hearthstone.data.modes]);
        const announcementList = ref<FormatAnnouncementProfile[]>([]);
        const selected = ref<FormatAnnouncementProfile | null>(null);

        const announcement = ref<FormatAnnouncement>({
            date:    '',
            source:  'blizzard',
            link:    [],
            version: 0,
            changes: [],
        });

        const announcementListWithLabel = computed(() => announcementList.value.map(a => ({
            value: a,
            label: `${a.date} - ${a.source}`,
        })));

        const dbId = computed(() => (announcement.value as any)?._id);

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

        const version = computed({
            get() { return announcement.value?.version; },
            set(newValue: number) {
                announcement.value.version = newValue;
            },
        });

        const lastVersion = computed({
            get() { return announcement.value?.lastVersion; },
            set(newValue: number | undefined) {
                announcement.value.lastVersion = newValue;
            },
        });

        const link = computed({
            get() { return announcement.value?.link ?? []; },
            set(newValue: string[]) { announcement.value.link = newValue; },
        });

        const changes = computed({
            get() { return announcement.value.changes; },
            set(newValue: FormatAnnouncement['changes']) {
                announcement.value.changes = newValue;
            },
        });

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

        const addDetail = <K extends EntityNumberKey>(
            array: Adjustment['detail'],
            key: K,
            oldValue: Entity,
            newValue: Entity,
            prefer: 'greater' | 'lesser',
        ) => {
            const oldField = oldValue[key];
            const newField = newValue[key];

            if (oldField == null || newField == null) {
                return;
            }

            const value = getStatus(oldField, newField, prefer);

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

        const calcStatus = async (a: Adjustment) => {
            if (lastVersion.value == null) {
                return;
            }

            const { data: oldData } = await apiGet<Entity>('/hearthstone/card', {
                id:      a.id,
                version: lastVersion.value,
            });

            const { data: newData } = await apiGet<Entity>('/hearthstone/card', {
                id:      a.id,
                version: version.value,
            });

            const newDetail: Adjustment['detail'] = [];

            addDetail(newDetail, 'cost', oldData, newData, 'lesser');
            addDetail(newDetail, 'attack', oldData, newData, 'greater');
            addDetail(newDetail, 'health', oldData, newData, 'greater');
            addDetail(newDetail, 'durability', oldData, newData, 'greater');
            addDetail(newDetail, 'armor', oldData, newData, 'greater');
            addDetail(newDetail, 'techLevel', oldData, newData, 'lesser');
            addDetail(newDetail, 'armorBucket', oldData, newData, 'greater');

            const oldLoc = oldData.localization.find(l => l.lang === 'en') ?? oldData.localization[0];
            const newLoc = newData.localization.find(l => l.lang === 'en') ?? newData.localization[0];

            if (oldLoc.text !== newLoc.text) {
                newDetail.push({ part: 'text', status: 'nerf' });
            }

            a.detail = newDetail;

            if (newDetail.length > 0) {
                if (newDetail.every(d => d.status === 'nerf')) {
                    a.status = 'nerf';
                } else if (newDetail.every(d => d.status === 'buff')) {
                    a.status = 'buff';
                } else {
                    a.status = 'adjust';
                }
            }
        };

        const addBanlist = (banlist: Banlist[]) => [
            ...banlist,
            {
                id:     '',
                status: last(banlist)?.status ?? 'banned',
            },
        ];

        const addAdjustment = (adjustment: Adjustment[]) => [
            ...adjustment,
            {
                id:      '',
                status:  last(adjustment)?.status ?? 'nerf',
                detail:  [],
                related: [],
            },
        ];

        const addEntity = (adjustment: Adjustment) => {
            if (adjustment.related == null) {
                adjustment.related = [];
            }

            adjustment.related.push('');
        };

        const loadData = async () => {
            const { data } = await controlGet<FormatAnnouncementProfile[]>('/hearthstone/format/announcement');

            announcementList.value = data;

            if (data.length > 0 && selected.value == null) {
                selected.value = data[0];
            }
        };

        const loadAnnouncement = async () => {
            if (selected.value?.id == null) {
                return;
            }

            const { data: result } = await controlGet<FormatAnnouncement>('/hearthstone/format/announcement', {
                id: selected.value.id,
            });

            announcement.value = result;
        };

        const saveAnnouncement = async () => {
            if (announcement.value == null) {
                return;
            }

            const data = toRaw(announcement.value);

            if (data.effectiveDate != null && Object.keys(data.effectiveDate).length === 0) {
                delete data.effectiveDate;
            }

            if (data.link?.length === 0) {
                delete data.link;
            }

            for (const c of data.changes) {
                if (c.setIn?.length === 0) {
                    delete c.setIn;
                }

                if (c.setOut?.length === 0) {
                    delete c.setOut;
                }

                if (c.banlist?.length === 0) {
                    delete c.banlist;
                }

                if (c.adjustment?.length === 0) {
                    delete c.adjustment;
                } else if (c.adjustment != null) {
                    for (const a of c.adjustment) {
                        if (a.related?.length === 0) {
                            delete a.related;
                        }
                    }
                }
            }

            await controlPost('/hearthstone/format/announcement/save', { data });

            await loadData();
        };

        const newAnnouncement = async () => {
            await saveAnnouncement();

            const todayDate = new Date().toLocaleDateString('en-CA');

            selected.value = null;

            announcement.value = {
                source:  'blizzard',
                date:    todayDate,
                version: 0,
                changes: [],
            };
        };

        const applyAnnouncements = async () => {
            await saveAnnouncement();

            await controlPost('/hearthstone/format/announcement/apply');
        };

        watch(selected, loadAnnouncement);
        onMounted(loadData);

        return {
            announcementListWithLabel,
            selected,

            dbId,
            date,
            effectiveDate,
            version,
            lastVersion,
            link,
            changes,

            modes,
            banlistOptions,
            adjustOptions,
            nextStatus,
            calcStatus,
            statusIcon,
            statusColor,

            newAnnouncement,
            saveAnnouncement,
            applyAnnouncements,
            addBanlist,
            addAdjustment,
            addEntity,
        };
    },
});

</script>
