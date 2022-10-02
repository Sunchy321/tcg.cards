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

        <div class="q-mt-md">
            <q-icon name="mdi-link" size="sm" />
            <q-btn
                class="q-ml-sm"
                flat dense round
                icon="mdi-plus"
                @click="link = [...link, '']"
            />
        </div>

        <div class="q-mt-sm">
            <div v-for="(l, i) in link" :key="'link-' + i" class="flex items-center q-mb-sm">
                <q-input v-model="link[i]" class="col-grow q-mr-sm" outlined dense />
                <q-btn icon="mdi-minus" flat dense round @click="link = [...link.slice(0, i), ...link.slice(i + 1)]" />
            </div>
        </div>

        <div class="q-mt-md">
            <q-icon name="mdi-text-box-outline" size="sm" />
            <q-btn
                class="q-ml-sm"
                flat dense round
                icon="mdi-plus"
                @click="changes = [...changes, { format: '', setIn: [], setOut: [], banlist: [] }]"
            />
        </div>

        <div v-for="c in changes" :key="'change-' + c.format" class="format q-mt-sm q-pa-sm">
            <div class="flex items-center">
                <q-select v-model="c.format" class="col-grow" :options="formats" outlined dense />
            </div>

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

            <div class="q-mt-sm">
                <q-icon name="mdi-card-bulleted-outline" size="sm" />
                <q-btn
                    class="q-ml-sm"
                    flat dense round
                    icon="mdi-plus"
                    @click="c.banlist = addBanlist(c.banlist ?? [])"
                />
            </div>

            <div
                v-for="(b, i) in c.banlist ?? []" :key="'banlist-' + i"
                class="flex items-center q-mt-sm"
            >
                <q-input
                    class="col-grow q-mr-sm"
                    :model-value="b.id"
                    outlined dense
                    @update:model-value="v => b.id = adjustId(v as string)"
                />
                <q-btn-toggle
                    v-model="b.status"
                    :options="statusOptions"
                    flat dense
                    :toggle-color="undefined"
                    color="white"
                    text-color="grey"
                />
                <q-btn
                    icon="mdi-arrow-up"
                    :disable="i === 0"
                    flat dense round
                    @click="c.banlist = moveUpBanlist(c.banlist ?? [], i)"
                />
                <q-btn
                    icon="mdi-arrow-down"
                    :disable="i === changes.length - 1"
                    flat dense round
                    @click="c.banlist = moveDownBanlist(c.banlist ?? [], i)"
                />
                <q-btn
                    icon="mdi-minus"
                    flat dense round
                    @click="c.banlist = removeBanlist(c.banlist ?? [], i)"
                />
            </div>
        </div>
    </div>
</template>

<style lang="sass" scoped>

.format
    border: 1px grey solid
    border-radius: 5px

</style>

<script lang="ts">
import {
    defineComponent, ref, computed, watch, onMounted, toRaw,
} from 'vue';

import { useMagic } from 'store/games/magic';

import controlSetup from 'setup/control';

import ArrayInput from 'components/ArrayInput.vue';
import DateInput from 'components/DateInput.vue';

import { FormatAnnouncement } from 'interface/magic/format-change';

import { deburr, last } from 'lodash';

type FormatAnnouncementBanlist = Required<FormatAnnouncement['changes'][0]>['banlist'];

interface FormatAnnouncementProfile {
    id?: string;
    source: string;
    date: string;
}

const sources = [
    'wotc',
    'duelcommander',
    'mtgcommander',
    'leviathan_commander',
    'pauper_commander',
    'initial',
    'rotation',
];

const statusIcon = (status: string, card?: string) => {
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
    'suspended',
    'restricted',
    'banned_as_commander',
    'banned_as_companion',
    'unavailable',
].map(v => ({
    icon:  statusIcon(v),
    class: `banlist-status-${v}`,
    value: v,
}));

const toIdentifier = (text: string) => deburr(text)
    .trim()
    .toLowerCase()
    .replace(' // ', '____')
    .replace('/', '____')
    .replace(/[^a-z0-9]/g, '_');

export default defineComponent({
    name: 'DataAnnouncement',

    components: { ArrayInput, DateInput },

    setup() {
        const magic = useMagic();

        const { controlGet, controlPost } = controlSetup();

        const formats = computed(() => magic.data.formats);
        const announcementList = ref<FormatAnnouncementProfile[]>([]);
        const selected = ref<FormatAnnouncementProfile | null>(null);

        const announcement = ref<FormatAnnouncement>({
            date:          '',
            source:        'wotc',
            effectiveDate: {},
            link:          [],
            changes:       [],
        });

        const announcementListWithLabel = computed(() => announcementList.value.map(a => ({
            value: a,
            label: `${a.date} - ${a.source}`,
        })));

        const dbId = computed(() => (announcement.value as any)?._id);

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
                    delete announcement.value.nextDate;
                } else {
                    announcement.value.nextDate = newValue;
                }
            },
        });

        const tabletopDate = computed({
            get() { return announcement.value?.effectiveDate?.tabletop ?? ''; },
            set(newValue: string) {
                if (announcement.value.effectiveDate == null) {
                    announcement.value.effectiveDate = {};
                }

                if (newValue === '') {
                    delete announcement.value.effectiveDate.tabletop;
                } else {
                    announcement.value.effectiveDate.tabletop = newValue;
                }
            },
        });

        const onlineDate = computed({
            get() { return announcement.value?.effectiveDate?.online ?? ''; },
            set(newValue: string) {
                if (announcement.value.effectiveDate == null) {
                    announcement.value.effectiveDate = {};
                }

                if (newValue === '') {
                    delete announcement.value.effectiveDate.online;
                } else {
                    announcement.value.effectiveDate.online = newValue;
                }
            },
        });

        const arenaDate = computed({
            get() { return announcement.value?.effectiveDate?.arena ?? ''; },
            set(newValue: string) {
                if (announcement.value.effectiveDate == null) {
                    announcement.value.effectiveDate = {};
                }

                if (newValue === '') {
                    delete announcement.value.effectiveDate.arena;
                } else {
                    announcement.value.effectiveDate.arena = newValue;
                }
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

        const adjustId = (id: string) => (id.startsWith('#') ? id : toIdentifier(id));

        const addBanlist = (banlist: FormatAnnouncementBanlist) => [
            ...banlist,
            {
                id:     '',
                status: last(banlist)?.status ?? 'banned',
            },
        ];

        const removeBanlist = (banlist: FormatAnnouncementBanlist, i: number) => [
            ...banlist.slice(0, i), ...banlist.slice(i + 1),
        ];

        const moveUpBanlist = (banlist: FormatAnnouncementBanlist, i: number) => (i === 0 ? banlist
            : [...banlist.slice(0, i - 1), banlist[i], banlist[i - 1], ...banlist.slice(i + 1)]);

        const moveDownBanlist = (banlist: FormatAnnouncementBanlist, i: number) => (i === banlist.length - 1 ? banlist
            : [...banlist.slice(0, i), banlist[i + 1], banlist[i], ...banlist.slice(i + 2)]);

        const loadData = async () => {
            const { data } = await controlGet<FormatAnnouncementProfile[]>('/magic/format/announcement');

            announcementList.value = data;

            if (data.length > 0 && selected.value == null) {
                selected.value = data[0];
            }
        };

        const loadAnnouncement = async () => {
            if (selected.value?.id == null) {
                return;
            }

            const { data: result } = await controlGet<FormatAnnouncement>('/magic/format/announcement', {
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
            }

            await controlPost('/magic/format/announcement/save', { data });

            void loadData();
        };

        const newAnnouncement = async () => {
            await saveAnnouncement();

            const todayDate = new Date().toLocaleDateString('en-CA');

            selected.value = null;

            announcement.value = {
                source:  'wotc',
                date:    todayDate,
                changes: [],
            };
        };

        const applyAnnouncements = async () => {
            await saveAnnouncement();

            await controlPost('/magic/format/announcement/apply');
        };

        watch(selected, loadAnnouncement);
        onMounted(loadData);

        return {
            announcementListWithLabel,
            announcement,
            selected,

            dbId,
            source,
            date,
            nextDate,
            tabletopDate,
            onlineDate,
            arenaDate,
            link,
            changes,

            sources,
            formats,
            statusOptions,

            newAnnouncement,
            saveAnnouncement,
            applyAnnouncements,
            adjustId,
            addBanlist,
            removeBanlist,
            moveUpBanlist,
            moveDownBanlist,
        };
    },
});

</script>
