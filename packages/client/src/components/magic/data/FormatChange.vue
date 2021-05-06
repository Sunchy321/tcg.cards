<template>
    <div class="q-pa-md">
        <div class="row items-center q-gutter-md">
            <q-select v-model="format" :options="[null, ...formatList]" dense outlined />
            <q-select v-model="selected" :options="formatChangeOptions" dense outlined options-dense />
            <date-input v-model="date" dense />
            <div class="col-grow" />
            <q-btn label="sync" flat dense @click="sync" />
            <q-btn icon="mdi-plus" flat dense round @click="add" />
            <q-btn v-if="formatChange != null" icon="mdi-upload" flat dense round @click="saveData" />
        </div>

        <div class="row items-center q-my-md">
            <q-icon name="mdi-card-bulleted-outline" size="sm" />
            <q-btn class="q-ml-sm" flat dense round icon="mdi-plus" @click="addChange" />
        </div>

        <div v-for="(c, i) in changes" :key="'change-' + i" class="row items-center q-gutter-sm">
            <q-select v-model="c.category" :options="['release', 'rotation', 'initial', 'other']" dense />
            <q-select v-model="c.format" :options="[null, ...formatList]" dense />

            <q-input
                class="col-grow"
                :model-value="c.in.join(', ')"
                dense
                @update:model-value="setChangeIn(c)"
            >
                <template #prepend>
                    <q-icon name="mdi-plus" />
                </template>
            </q-input>

            <q-input
                class="col-grow"
                :model-value="c.out.join(', ')"
                dense
                @update:model-value="setChangeOut(c)"
            >
                <template #prepend>
                    <q-icon name="mdi-minus" />
                </template>
            </q-input>

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
    </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, watch, onMounted } from 'vue';

import controlSetup from 'setup/control';

import DateInput from 'components/DateInput.vue';

interface FormatChangeDetail {
    category: string,
    format?: string,
    in: string[],
    out: string[],
}

interface FormatChange {
    date: string;
    changes: FormatChangeDetail[];
}

export default defineComponent({
    name: 'DataFormatChange',

    components: { DateInput },

    setup() {
        const { controlGet, controlPost } = controlSetup();

        const format = ref<string|null>(null);
        const formatChanges = ref<FormatChange[]>([]);
        const selected = ref<{ label: string, value: FormatChange }|null>(null);

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
            'commander1v1',
            'brawl',

            'pauper',

            'block/ice_age',
            'block/tempest',
            'block/urza',
            'block/masques',
            'block/mirrodin',
        ];

        const formatChangeOptions = computed(() => formatChanges.value.map(r => ({ label: r.date ?? '#', value: r })));

        const formatChange = computed(() => selected.value?.value);

        const date = computed({
            get() {
                return formatChange.value?.date ?? '';
            },
            set(newValue: string) {
                if (formatChange.value != null) {
                    formatChange.value.date = newValue;
                }
            },
        });

        const changes = computed({
            get() {
                return formatChange.value?.changes ?? [];
            },
            set(newValue: FormatChangeDetail[]) {
                if (formatChange.value != null) {
                    formatChange.value.changes = newValue;
                }
            },
        });

        const loadData = async () => {
            const { data } = await controlGet<FormatChange[]>('/magic/format/change', { id: format.value });

            formatChanges.value = data;

            if (selected.value == null || selected.value.label === '#') {
                selected.value = formatChangeOptions.value[0];
            }
        };

        const saveData = async () => {
            await controlPost('/magic/format/change/save', {
                data: formatChange,
            });

            await loadData();
        };

        const sync = async () => {
            const { data, status } = await controlPost('/magic/format/sync');

            if (status === 500) {
                console.log(data);
            }
        };

        const add = async () => {
            if (selected.value?.label === '#') {
                await saveData();
            }

            formatChanges.value.unshift({ date: '', changes: [] });

            selected.value = formatChangeOptions.value[0];

            addChange();
        };

        const addChange = () => {
            changes.value.push({
                category: 'release',
                format:   '',
                in:       [],
                out:      [],
            });
        };

        const removeChange = (i: number) => {
            changes.value.splice(i, 1);
        };

        const setChangeIn = (c: FormatChangeDetail) => (v: string) => {
            c.in = v.split(',').map(s => s.trim()).filter(s => s !== '');
        };

        const setChangeOut = (c: FormatChangeDetail) => (v: string) => {
            c.out = v.split(',').map(s => s.trim()).filter(s => s !== '');
        };

        const moveChangeUp = (i :number) => {
            if (i !== 0) {
                const curr = changes.value[i];
                const prev = changes.value[i - 1];

                changes.value[i - 1] = curr;
                changes.value[i] = prev;
            }
        };

        const moveChangeDown = (i :number) => {
            if (i !== changes.value.length - 1) {
                const curr = changes.value[i];
                const next = changes.value[i + 1];

                changes.value[i + 1] = curr;
                changes.value[i] = next;
            }
        };

        watch(format, loadData);
        onMounted(loadData);

        return {
            format,
            formatList,
            formatChange,
            selected,
            date,
            changes,

            formatChangeOptions,

            saveData,
            sync,
            add,
            addChange,
            removeChange,
            setChangeIn,
            setChangeOut,
            moveChangeUp,
            moveChangeDown,
        };
    },
});
</script>
