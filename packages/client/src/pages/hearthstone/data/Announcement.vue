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

            <q-input v-model="lastVersion" outlined dense clearable type="number">
                <template #before>
                    <q-icon name="mdi-history" />
                </template>
            </q-input>

            <q-input v-model="version" class="q-ml-md" outlined dense type="number">
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
                <q-select v-model="c.format" class="col-grow" :options="formats" outlined dense />

                <date-input v-model="c.effectiveDate" class="q-ml-md" outlined dense />
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
                            :format="c.format"
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
                            :format="c.format"
                            :version="version"
                            outlined dense
                        />

                        <q-btn
                            class="q-mr-sm"
                            icon="mdi-cards-outline"
                            flat round dense
                            @click="() => addRelated(a)"
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
                            @click="() => addDetail(a)"
                        />

                        <q-chip
                            v-for="(d, i) of a.detail" :key="d.part"
                            class="flex items-center q-mr-sm"
                            square removable
                            :icon="statusIcon(d.status)"
                            :color="statusColor(d.status)"
                            text-color="white"
                            :clickable="d.part === 'text' || d.part === 'rune'"
                            @click="d.status = nextStatus(d.status)"
                            @remove="a.detail.splice(i, 1)"
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
                                :format="c.format"
                                :version="version"
                                outlined dense
                                :model-value="r"
                                @update:model-value="v => a.related[i] = v"
                            >
                                <template #append>
                                    <q-btn
                                        icon="mdi-minus"
                                        flat round dense
                                        @click="a.related.splice(i, 1)"
                                    />
                                </template>
                            </entity-input>
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

import { useQuasar } from 'quasar';
import { useHearthstone } from 'store/games/hearthstone';

import controlSetup from 'setup/control';

import List from 'components/List.vue';
import ArrayInput from 'components/ArrayInput.vue';
import DateInput from 'components/DateInput.vue';
import EntityInput from 'components/hearthstone/data/EntityInput.vue';

import { Entity } from 'interface/hearthstone/entity';
import { FormatAnnouncement } from 'interface/hearthstone/format-change';

import { isEqual, last } from 'lodash';
import { apiGet } from 'boot/server';

type EntityNumberKey = {
    [K in keyof Required<Entity>]: Required<Entity>[K] extends number ? K : never;
}[keyof Entity];

type Banlist = Required<FormatAnnouncement['changes'][0]>['banlist'][0];
type Adjustment = Required<FormatAnnouncement['changes'][0]>['adjustment'][0];

interface FormatAnnouncementProfile {
    id?: string;
    source: string;
    date: string;
    name: string;
}

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

const banlistOptions = [
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

export default defineComponent({
    name: 'DataAnnouncement',

    components: {
        ArrayInput,
        DateInput,
        List,
        EntityInput,
    },

    setup() {
        const { dialog } = useQuasar();
        const hearthstone = useHearthstone();

        const { controlGet, controlPost } = controlSetup();

        const formats = computed(() => ['#hearthstone', ...hearthstone.formats]);
        const announcementList = ref<FormatAnnouncementProfile[]>([]);
        const selected = ref<FormatAnnouncementProfile | null>(null);

        const announcement = ref<FormatAnnouncement>({
            date:    '',
            source:  'blizzard',
            name:    '',
            link:    [],
            version: 0,
            changes: [],
        });

        const announcementListWithLabel = computed(() => announcementList.value.map(a => ({
            value: a,
            label: `${a.name} [${a.date}] - ${a.source}`,
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

        const pushDetail = <K extends EntityNumberKey>(
            array: Adjustment['detail'],
            key: K,
            oldValue: Entity,
            newValue: Entity,
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

        const addDetail = (a: Adjustment) => {
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
                    if (a.detail == null) {
                        a.detail = [];
                    }

                    a.detail.push({ part, status });
                });
            });
        };

        const calcStatus = async (a: Adjustment) => {
            if (lastVersion.value == null || a.id == null || a.id === '') {
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

            pushDetail(newDetail, 'cost', oldData, newData, 'lesser');
            pushDetail(newDetail, 'attack', oldData, newData, 'greater');
            pushDetail(newDetail, 'health', oldData, newData, 'greater');
            pushDetail(newDetail, 'durability', oldData, newData, 'greater');
            pushDetail(newDetail, 'armor', oldData, newData, 'greater');
            pushDetail(newDetail, 'techLevel', oldData, newData, 'lesser');
            pushDetail(newDetail, 'armorBucket', oldData, newData, 'greater');
            pushDetail(newDetail, 'colddown', oldData, newData, 'lesser');

            const oldLoc = oldData.localization.find(l => l.lang === 'en') ?? oldData.localization[0];
            const newLoc = newData.localization.find(l => l.lang === 'en') ?? newData.localization[0];

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
            ...banlist ?? [],
            {
                id:     '',
                status: last(banlist)?.status ?? 'banned',
            },
        ];

        const addAdjustment = (adjustment: Adjustment[]) => [
            ...adjustment ?? [],
            {
                id:      '',
                status:  last(adjustment)?.status ?? 'nerf',
                detail:  [],
                related: [],
            },
        ];

        const addRelated = (adjustment: Adjustment) => {
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

            const todayDate = new Date().toISOString().split('T')[0];

            selected.value = null;

            announcement.value = {
                source:  'blizzard',
                date:    todayDate,
                name:    '',
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
            name,
            version,
            lastVersion,
            link,
            changes,

            formats,
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
            addDetail,
            addRelated,
        };
    },
});

</script>
