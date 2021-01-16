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
            <q-select v-model="c.reason" :options="['release', 'rotation', 'initial', 'other']" dense />
            <q-select v-model="c.format" :options="[null, ...formatList]" dense />

            <q-input
                class="col-grow"
                :value="c.in.join(', ')"
                dense
                @input="v => c.in = v.split(',').map(s => s.trim()).filter(s => s !== '')"
            >
                <template v-slot:prepend>
                    <q-icon name="mdi-plus" />
                </template>
            </q-input>

            <q-input
                class="col-grow"
                :value="c.out.join(', ')"
                dense
                @input="v => c.out = v.split(',').map(s => s.trim()).filter(s => s !== '')"
            >
                <template v-slot:prepend>
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

<script>
import DateInput from 'components/DateInput';

export default {
    name: 'DataFormatChange',

    components: { DateInput },

    data: () => ({
        format:        null,
        formatChanges: [],
        selected:      null,
    }),

    computed: {
        formatList() {
            return [
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
        },

        formatChangeOptions() {
            return this.formatChanges.map(r => ({ label: r.date ?? '#', value: r }));
        },

        formatChange() {
            return this.selected?.value;
        },

        date: {
            get() {
                return this.formatChange?.date;
            },
            set(newValue) {
                if (this.formatChange != null) {
                    this.formatChange.date = newValue;
                }
            },
        },

        changes: {
            get() {
                return this.formatChange?.changes;
            },
            set(newValue) {
                if (this.formatChange != null) {
                    this.formatChange.changes = newValue;
                }
            },
        },

    },

    watch: {
        format() {
            this.loadData();
        },
    },

    mounted() {
        this.loadData();
    },

    methods: {
        async loadData() {
            const { data } = await this.apiGet('/magic/format/change', { id: this.format });

            this.formatChanges = data;

            if (this.selected == null || this.selected.label === '#') {
                this.selected = this.formatChangeOptions[0];
            }
        },

        async saveData() {
            await this.apiPost('/magic/format/change/save', {
                data: this.formatChange,
            });

            await this.loadData();
        },

        async sync() {
            const { data, status } = await this.apiPost('/magic/format/sync');

            if (status === 500) {
                console.log(data);
            }
        },

        async add() {
            if (this.selected?.label === '#') {
                await this.saveData();
            }

            this.formatChanges.unshift({ date: null, changes: [] });

            this.selected = this.formatChangeOptions[0];

            this.addChange();
        },

        addChange() {
            this.changes.push({
                reason: 'release',
                format: null,
                in:     [],
                out:    [],
            });
        },

        removeChange(i) {
            this.changes.splice(i, 1);
        },

        moveChangeUp(i) {
            if (i !== 0) {
                const curr = this.changes[i];
                const prev = this.changes[i - 1];

                this.$set(this.changes, i - 1, curr);
                this.$set(this.changes, i, prev);
            }
        },

        moveChangeDown(i) {
            if (i !== this.changes.length - 1) {
                const curr = this.changes[i];
                const next = this.changes[i + 1];

                this.$set(this.changes, i + 1, curr);
                this.$set(this.changes, i, next);
            }
        },
    },
};
</script>
