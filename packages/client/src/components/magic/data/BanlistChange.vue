<template>
    <div class="q-pa-md">
        <q-input
            v-model="url"
            dense
        >
            <template #append>
                <q-btn
                    icon="mdi-text-box-search"
                    flat dense round
                    @click="parseUrl"
                />
            </template>
        </q-input>

        <div class="row items-center q-py-md">
            <q-select
                v-model="selected"
                style="width: 150px"
                :options="changeList"
                option-label="date"
                outlined dense
            />

            <div v-if="data != null" class="code q-mx-md">
                {{ data._id || 'unsaved' }}
            </div>

            <q-select
                v-model="category"
                :options="[
                    'wotc',
                    'duelcommander',
                    'mtgcommander',
                    'leviathan_commander',
                    'initial',
                ]"
            />

            <div class="col-grow" />

            <q-btn label="sync" flat dense @click="sync" />
            <q-btn icon="mdi-plus" flat dense round @click="newChange" />
            <q-btn v-if="data != null" icon="mdi-upload" flat dense round @click="saveChange" />
        </div>

        <template v-if="data != null">
            <div class="row justify-between">
                <div class="row items-center">
                    <q-icon name="mdi-calendar" size="sm" class="q-mr-sm" />
                    <date-input v-model="date" dense />
                </div>
                <div class="row items-center">
                    <q-icon name="mdi-arrow-right-circle" size="sm" class="q-mr-sm" />
                    <date-input v-model="nextDate" dense />
                </div>
                <div class="row items-center">
                    <q-icon name="mdi-cards-outline" size="sm" class="q-mr-sm" />
                    <date-input v-model="eDateTable" dense />
                </div>
                <div class="row items-center">
                    <q-icon name="mdi-alpha-o-circle-outline" size="sm" class="q-mr-sm" />
                    <date-input v-model="eDateOnline" dense />
                </div>
                <div class="row items-center">
                    <q-icon name="mdi-alpha-a-circle-outline" size="sm" class="q-mr-sm" />
                    <date-input v-model="eDateArena" dense />
                </div>
            </div>
            <div class="row items-center q-my-sm">
                <q-icon name="mdi-link" size="sm" />
                <q-btn
                    class="q-ml-sm"
                    flat dense round
                    icon="mdi-plus"
                    @click="data?.link?.push('')"
                />
            </div>
            <q-input v-for="(l, i) in data.link" :key="l" v-model="data.link[i]" class="q-my-sm" dense />
            <div class="row items-center">
                <q-icon name="mdi-card-bulleted-outline" size="sm" />
                <q-btn
                    class="q-ml-sm"
                    flat dense round
                    icon="mdi-plus"
                    @click="addChange"
                />
            </div>
            <div v-for="(c, i) in changes" :key="'change-' + i" class="row q-gutter-sm">
                <q-input
                    :model-value="c.card"
                    class="col"
                    dense
                    @update:model-value="v => modifyChangeCard(c, v)"
                />
                <q-select
                    v-model="c.format"
                    :options="formatList"
                    dense
                    emit-value
                    map-options
                />
                <q-btn-toggle
                    v-model="c.status"
                    :options="statusList"
                    flat dense
                    :toggle-color="null"
                    color="white"
                    text-color="grey"
                />
                <q-btn
                    size="sm"
                    flat dense
                    icon="mdi-arrow-up"
                    :disable="i === 0"
                    @click="moveChangeUp(i)"
                />
                <q-btn
                    size="sm"
                    flat dense
                    icon="mdi-arrow-down"
                    :disable="i === changes.length - 1"
                    @click="moveChangeDown(i)"
                />
                <q-btn
                    size="sm"
                    flat dense
                    icon="mdi-minus"
                    @click="removeChange(i)"
                />
            </div>
        </template>
    </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, watch, onMounted } from 'vue';

import controlSetup from 'setup/control';

import DateInput from 'components/DateInput.vue';

import { deburr, last } from 'lodash';

type BanlistStatus =
    'legal' | 'restricted' | 'suspended' | 'banned' | 'banned_as_commander' | 'banned_as_companion' | 'unavailable';

interface BanlistChangeItem {
    card: string;
    format: string;
    status?: BanlistStatus;
    effectiveDate?: string;
    detail?: { card: string, date?: string, status?: string }[];
}

interface BanlistChange {
    _id?: string;

    date: string;

    category: string;

    effectiveDate?: {
        tabletop?: string;
        online?: string;
        arena?: string;
    };

    nextDate?: string;

    link: string[];

    changes: BanlistChangeItem[];
}

interface BanlistChangeProfile {
    id?: string;
    date: string;
}

function toIdentifier(text: string) {
    return deburr(text)
        .trim()
        .toLowerCase()
        .replace(' // ', '____')
        .replace('/', '____')
        .replace(/[^a-z0-9]/g, '_');
}

export default defineComponent({
    name: 'DataBanlistChange',

    components: { DateInput },

    setup() {
        const { controlGet, controlPost } = controlSetup();

        const url = ref('');

        const changeList = ref<BanlistChangeProfile[]>([]);
        const selected = ref<BanlistChangeProfile|null>(null);

        const data = ref<BanlistChange|null>(null);

        const formatList = [
            'standard',
            'historic',
            'pioneer',
            'modern',
            'extended',
            'legacy',
            'vintage',

            'standard/arena',

            'commander',
            'duelcommander',
            'leviathan_commander',
            'commander1v1',
            'brawl',
            'historic_brawl',

            'pauper',

            'block/ice_age',
            'block/tempest',
            'block/urza',
            'block/masques',
            'block/mirrodin',
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
            }
        };

        const statusList = [
            'legal',
            'banned',
            'suspended',
            'restricted',
            'banned_as_commander',
            'banned_as_companion',
            'unavailable',
        ].map(v => ({
            icon:  statusIcon(v),
            class: 'magic-banlist-status-' + v,
            value: v,
        }));

        const category = computed({
            get() {
                return data.value?.category ?? 'wotc';
            },
            set(newValue: string) {
                if (data.value != null) {
                    data.value.category = newValue;
                }
            },
        });

        const date = computed({
            get() {
                return data.value?.date ?? '';
            },
            set(newValue: string) {
                if (data.value != null) {
                    data.value.date = newValue;
                }
            },
        });

        const nextDate = computed({
            get() {
                return data.value?.nextDate ?? '';
            },
            set(newValue: string) {
                if (data.value != null) {
                    data.value.nextDate = newValue;
                }
            },
        });

        const eDateTable = computed({
            get() {
                return data.value?.effectiveDate?.tabletop ?? '';
            },
            set(newValue: string) {
                if (data.value != null) {
                    data.value.effectiveDate = {
                        ...data.value.effectiveDate ?? {},
                        tabletop: newValue,
                    };
                }
            },
        });

        const eDateOnline = computed({
            get() {
                return data.value?.effectiveDate?.online ?? '';
            },
            set(newValue: string) {
                if (data.value != null) {
                    data.value.effectiveDate = {
                        ...data.value.effectiveDate ?? {},
                        online: newValue,
                    };
                }
            },
        });

        const eDateArena = computed({
            get() {
                return data.value?.effectiveDate?.arena ?? '';
            },
            set(newValue: string) {
                if (data.value != null) {
                    data.value.effectiveDate = {
                        ...data.value.effectiveDate ?? {},
                        arena: newValue,
                    };
                }
            },
        });

        const changes = computed(() => data.value?.changes ?? []);

        const loadData = async () => {
            const { data } = await controlGet<BanlistChangeProfile[]>('/magic/format/banlist/change');

            changeList.value = data;

            if (data.length > 0 && selected.value == null) {
                selected.value = data[0];
            }
        };

        const loadChange = async () => {
            if (selected.value?.id != null) {
                data.value = null;

                const { data: result } = await controlGet<BanlistChange>('/magic/format/banlist/change', {
                    id: selected.value.id,
                });

                data.value = result;
            }
        };

        const parseUrl = async () => {
            const { data: result } = await controlGet<BanlistChange>('/magic/format/banlist/change/parse', {
                url: url.value,
            });

            changeList.value.unshift({ date: result.date });
            selected.value = { date: result.date };
            data.value = result;
        };

        const newChange = () => {
            const date = new Date().toLocaleDateString('en-CA');

            changeList.value.unshift({ date });
            selected.value = { date };
            data.value = {
                date,
                link:     [],
                category: 'wotc',
                changes:  [],
            };
        };

        const saveChange = async () => {
            await controlPost('/magic/format/banlist/change/save', {
                data: data.value,
            });

            void loadData();
        };

        const sync = async () => {
            const { data, status } = await controlPost('/magic/format/sync');

            if (status === 500) {
                console.log(data);
            }
        };

        const addChange = () => {
            if (changes.value.length !== 0) {
                changes.value.push({
                    card:   '',
                    format: last(changes.value)!.format,
                    status: last(changes.value)!.status,
                });
            } else {
                changes.value.push({
                    card:   '',
                    format: 'standard',
                    status: 'banned',
                });
            }
        };

        const removeChange = (i: number) => {
            changes.value.splice(i, 1);
        };

        const moveChangeUp = (i: number) => {
            if (i !== 0) {
                const curr = changes.value[i];
                const prev = changes.value[i - 1];

                changes.value[i - 1] = curr;
                changes.value[i] = prev;
            }
        };

        const moveChangeDown = (i: number) => {
            if (i !== changes.value.length - 1) {
                const curr = changes.value[i];
                const next = changes.value[i + 1];

                changes.value[i + 1] = curr;
                changes.value[i] = next;
            }
        };

        const modifyChangeCard = (c: BanlistChangeItem, v: string) => {
            if (v.startsWith('#')) {
                c.card = v;
            } else {
                c.card = toIdentifier(v);
            }
        };

        watch(selected, loadChange);
        onMounted(loadData);

        return {
            formatList,
            statusList,

            url,
            changeList,
            selected,
            data,

            date,
            category,
            nextDate,
            eDateTable,
            eDateOnline,
            eDateArena,
            changes,

            sync,
            parseUrl,
            newChange,
            saveChange,
            addChange,
            moveChangeUp,
            moveChangeDown,
            removeChange,
            modifyChangeCard,
        };
    },
});
</script>
