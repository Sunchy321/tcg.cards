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
                        <q-input
                            v-model="b.id"
                            class="col-grow q-mr-sm"
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
                    :model-value="c.adjust ?? []"
                    @update:model-value="a => c.adjust = a"
                    @insert="c.adjust = addAdjust(c.adjust)"
                >
                    <template #title>
                        <q-icon name="mdi-compare" size="sm" />
                    </template>
                    <template #summary="{ value: a }">
                        <entity-essential v-model="a.from" name="From" />
                        <q-icon name="mdi-arrow-right-thin" size="md" />
                        <entity-essential v-model="a.to" name="To" />

                        <div class="col-grow" />

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
                        <div class="q-mt-sm">
                            <q-btn
                                icon="mdi-plus"
                                flat round dense
                                @click="() => addEntity(a)"
                            />

                            <entity-essential
                                v-for="(e, i) in a.entity"
                                :key="e?.cardId ?? ''"
                                class="q-ml-sm"
                                :model-value="e"
                                @update:model-value="v => a.entity[i] = e"
                            >
                                <template #append>
                                    <q-btn
                                        icon="mdi-minus"
                                        flat round dense
                                        size="sm"
                                        @click="a.entity.splice(i, 1)"
                                    />
                                </template>
                            </entity-essential>
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
import EntityEssentialComponent from 'components/hearthstone/EntityEssential.vue';

import { FormatAnnouncement, EntityEssential } from 'interface/hearthstone/format-change';

import { cloneDeep, last } from 'lodash';

type FormatAnnouncementBanlist = Required<FormatAnnouncement['changes'][0]>['banlist'];
type FormatAnnouncementAdjust = Required<FormatAnnouncement['changes'][0]>['adjust'];

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

const defaultEntityEssential: EntityEssential = {
    cardId: '',

    localization: [],

    set:      '',
    classes:  [],
    cardType: 'minion',
    cost:     0,

    collectible: true,
    elite:       false,

    mechanics:      [],
    referencedTags: [],
};

export default defineComponent({
    name: 'DataAnnouncement',

    components: {
        ArrayInput,
        DateInput,
        List,
        EntityEssential: EntityEssentialComponent,
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

        const addBanlist = (banlist: FormatAnnouncementBanlist) => [
            ...banlist,
            {
                id:     '',
                status: last(banlist)?.status ?? 'banned',
            },
        ];

        const addAdjust = (adjust: FormatAnnouncementAdjust) => [
            ...adjust,
            {
                from:    last(adjust)?.from ?? cloneDeep(defaultEntityEssential),
                to:      last(adjust)?.to ?? cloneDeep(defaultEntityEssential),
                related: [],
            },
        ];

        const addEntity = (adjust: FormatAnnouncementAdjust[0]) => {
            if (adjust.entity == null) {
                adjust.entity = [];
            }

            adjust.entity.push(cloneDeep(defaultEntityEssential));
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

                if (c.adjust?.length === 0) {
                    delete c.adjust;
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
            link,
            changes,

            modes,
            banlistOptions,
            adjustOptions,

            newAnnouncement,
            saveAnnouncement,
            applyAnnouncements,
            addBanlist,
            addAdjust,
            addEntity,
        };
    },
});

</script>
