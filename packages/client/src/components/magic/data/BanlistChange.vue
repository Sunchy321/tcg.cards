<template>
    <div class="q-pa-md">
        <div v-if="progress != null" class="row items-center">
            <div class="q-mr-sm">
                {{ progressLabel }}
            </div>

            <q-linear-progress
                rounded
                color="primary"
                :indeterminate="progressValue == null"
                :value="progressValue"
                size="15px"
                class="flex-grow"
            />
        </div>

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
            <q-btn label="assign" flat dense @click="assign" />
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

<style lang="sass">
.banlist-status-banned,
.banlist-status-suspended,
.banlist-status-banned_as_commander,
.banlist-status-banned_as_companion,
.color-negative
    color: #F33

.banlist-status-restricted
    color: #EA0

.banlist-status-legal,
.color-positive
    color: #0A0

.banlist-status-unavailable
    color: #777
</style>

<script lang="ts">
import { defineComponent, ref, computed, watch, onMounted } from 'vue';

import { useRouter } from 'vue-router';

import controlSetup from 'setup/control';

import DateInput from 'components/DateInput.vue';

import { deburr, last } from 'lodash';

/// *** eslint cannot recognize type imported from vue file ***
type BanlistStatus =
    'legal' | 'restricted' | 'suspended' | 'banned' | 'banned_as_commander' | 'banned_as_companion' | 'unavailable';

interface BanlistChangeItem {
    card: string;
    format: string;
    status?: BanlistStatus;
    effectiveDate?: string;
    detail?: { card: string, date?: string, status?: BanlistStatus }[];
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

interface Status {
    amount: {
        count: number;
        total: number;
    };

    time: {
        elapsed: number;
        remaining: number;
    };

    wrongs: {
        cardId: string;
        format: string;
        data: string;
        scryfall: string;
    }[]
}

function toIdentifier(text: string) {
    return deburr(text)
        .trim()
        .toLowerCase()
        .replace(' // ', '____')
        .replace('/', '____')
        .replace(/[^a-z0-9]/g, '_');
}

function formatTime(time: number) {
    let result = '';

    time = Math.floor(time / 1000);

    result = `${time % 60}`;

    time = Math.floor(time / 60);

    result = `${time % 60}:${result}`;

    time = Math.floor(time / 60);

    result = `${time % 60}:${result}`;

    time = Math.floor(time / 24);

    if (time > 0) {
        result = `${time} ${result}`;
    }

    return result;
}

export default defineComponent({
    name: 'DataBanlistChange',

    components: { DateInput },

    setup() {
        const router = useRouter();

        const { controlGet, controlPost, controlWs } = controlSetup();

        const progress = ref<Status|null>(null);

        const progressValue = computed(() => {
            const prog = progress.value;

            if (prog != null && prog.amount.total != null) {
                return prog.amount.count / prog.amount.total;
            } else {
                return null;
            }
        });

        const progressLabel = computed(() => {
            const prog = progress.value;

            if (prog != null) {
                let result = '';

                result += prog.amount.count;

                if (prog.amount.total != null) {
                    result += `/${prog.amount.total}`;
                }

                if (prog.time != null) {
                    result += ` (${formatTime(prog.time.remaining)})`;
                }

                return result;
            } else {
                return '';
            }
        });

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
            class: 'banlist-status-' + v,
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

        const assign = async () => {
            const ws = controlWs('/magic/format/assign-legality');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    progress.value = JSON.parse(data) as Status;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    const wrongs = progress.value?.wrongs ?? [];

                    if (wrongs.length > 0) {
                        console.log(wrongs);

                        wrongs.forEach(v => {
                            const route = router.resolve('/magic/card/' + v.cardId);

                            window.open(route.href, '_blank');
                        });
                    }

                    progress.value = null;

                    resolve(undefined);
                };
            });
        };

        const addChange = () => {
            if (changes.value.length !== 0) {
                changes.value.push({
                    card:   '',
                    format: last(changes.value)!.format,
                    status: last(changes.value)!.status ?? 'banned',
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
            progress,
            progressValue,
            progressLabel,

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
            assign,
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
