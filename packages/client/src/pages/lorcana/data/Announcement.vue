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
                    @update:model-value="(update as any)"
                />
            </template>
        </list>

        <list
            v-model="changes"
            class="change-list q-mt-md"
            item-class="change q-mt-sm q-pa-sm"
            @insert="() => addChange()"
        >
            <template #title>
                <q-icon name="mdi-text-box-outline" size="sm" />
            </template>
            <template #summary="{ value: c }">
                <q-select v-model="c.format" class="col-grow" :options="formats" outlined dense />
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

import { useLorcana } from 'store/games/lorcana';

import controlSetup from 'setup/control';
import pageSetup from 'src/setup/page';

import List from 'components/List.vue';
import ArrayInput from 'components/ArrayInput.vue';
import DateInput from 'components/DateInput.vue';

import { FormatAnnouncement } from 'interface/lorcana/format-change';

import { last } from 'lodash';

import { toIdentifier } from 'common/util/id';

type BanlistItem = Required<FormatAnnouncement['changes'][0]>['banlist'][0];

interface FormatAnnouncementProfile {
    id?:    string;
    source: string;
    date:   string;
}

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

const lorcana = useLorcana();

const { controlGet, controlPost } = controlSetup();

const {
    filter,
} = pageSetup({
    params: {
        filter: {
            type:    'enum',
            bind:    'query',
            values:  ['', ...sources],
            default: '',
        },
    },

    appendParam: true,
});

const formats = computed(() => ['#core', ...lorcana.formats]);
const announcementList = ref<FormatAnnouncementProfile[]>([]);
const selected = ref<FormatAnnouncementProfile | null>(null);

const announcement = ref<FormatAnnouncement>({
    date:    '',
    source:  'disney',
    link:    [],
    changes: [],
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

const effectiveDate = computed({
    get() { return announcement.value?.effectiveDate ?? ''; },
    set(newValue: string) {
        if (newValue === '') {
            announcement.value.effectiveDate = undefined;
        } else {
            announcement.value.effectiveDate = newValue;
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

const addChange = (format = '') => {
    changes.value.push({
        format,
        setIn:   [],
        setOut:  [],
        banlist: [],
    });
};

const adjustId = (id: string) => (id.startsWith('#') ? id : toIdentifier(id));

const addBanlist = (banlist: BanlistItem[]) => [
    ...banlist,
    {
        id:     '',
        status: last(banlist)?.status ?? 'banned',
    },
];

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
    if (changes.value.length !== 0) {
        return;
    }

    const format = formatMap[source.value];

    if (format == null) {
        return;
    }

    addChange(format);
};

watch(source, fillEmptyAnnouncement);

const loadData = async () => {
    const { data } = await controlGet<FormatAnnouncementProfile[]>('/lorcana/format/announcement');

    announcementList.value = data;

    if (announcementFiltered.value.length > 0 && selected.value == null) {
        selected.value = announcementFiltered.value[0];
    }
};

onMounted(loadData);

const loadAnnouncement = async () => {
    if (selected.value?.id == null) {
        return;
    }

    const { data: result } = await controlGet<FormatAnnouncement>('/lorcana/format/announcement', {
        id: selected.value.id,
    });

    announcement.value = result;
};

watch(selected, loadAnnouncement);

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

    await controlPost('/lorcana/format/announcement/save', { data });

    await loadData();
};

const newAnnouncement = async () => {
    await saveAnnouncement();

    const todayDate = new Date().toISOString().split('T')[0];

    selected.value = null;

    announcement.value = {
        source:  filter.value === '' ? 'wotc' : filter.value,
        date:    todayDate,
        changes: [],
    };

    fillEmptyAnnouncement();
};

const applyAnnouncements = async () => {
    await saveAnnouncement();

    await controlPost('/lorcana/format/announcement/apply');
};

</script>

<style lang="sass" scoped>

.change-list :deep(.change)
    border: 1px grey solid
    border-radius: 5px

.score-input
    width: 150px

</style>
