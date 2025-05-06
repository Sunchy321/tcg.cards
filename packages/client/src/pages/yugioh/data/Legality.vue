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
                class="col-grow"
            />
        </div>

        <div>
            <q-btn label="assign" flat dense @click="assign" />
            <q-btn class="q-ml-sm" label="test" flat dense @click="test" />
        </div>

        <div
            v-for="(w, i) in progress?.wrongs ?? []"
            :key="`${w.format}:${w.legality[0]}:${w.legality[1]}`"
            class="q-ma-md"
        >
            <div>
                <span>{{ $t(`yugioh.format.${w.format}`) }} {{ w.legality[0] }} {{ w.legality[1] }}</span>
                <q-btn
                    flat round dense
                    icon="mdi-close"
                    @click="removeWrongs(i)"
                />
            </div>

            <grid
                v-slot="{ id }"
                :value="w.cards.map(id => ({ id }))" :item-width="400"
                class="legalities"
            >
                <card-avatar :id="id" :key="id" />
            </grid>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed } from 'vue';

import controlSetup from 'src/setup/control';

import Grid from 'components/Grid.vue';
import CardAvatar from 'components/yugioh/CardAvatar.vue';

interface Status {
    amount: {
        count: number;
        total: number;
    };

    time: {
        elapsed:   number;
        remaining: number;
    };

    wrongs: {
        format:   string;
        legality: [string, string];
        cards:    string[];
    }[];
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
    name: 'DataLegality',

    components: { Grid, CardAvatar },

    setup() {
        const { controlWs } = controlSetup();

        const progress = ref<Status | null>(null);

        const progressValue = computed(() => {
            const prog = progress.value;
            if (prog?.amount?.total != null) {
                return prog.amount.count / prog.amount.total;
            } else {
                return undefined;
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

        const assign = async () => {
            progress.value = null;

            const ws = controlWs('/yugioh/format/assign-legality');
            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    progress.value = JSON.parse(data) as Status;
                };
                ws.onerror = reject;
                ws.onclose = resolve;
            });
        };

        const test = async () => {
            progress.value = null;

            const ws = controlWs('/yugioh/format/test-legality');
            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    progress.value = JSON.parse(data) as Status;
                };
                ws.onerror = reject;
                ws.onclose = resolve;
            });
        };

        const removeWrongs = (i: number) => {
            if (progress.value == null) {
                return;
            }

            progress.value.wrongs.splice(i, 1);
        };

        return {
            assign,
            test,
            progress,
            progressValue,
            progressLabel,
            removeWrongs,
        };
    },
});
</script>
