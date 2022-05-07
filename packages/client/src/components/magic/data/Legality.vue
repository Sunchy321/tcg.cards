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
        </div>

        <grid
            v-slot="{ cardId, format, data, scryfall }"
            :value="progress?.wrongs ?? []" :item-width="400"
            class="legalities"
        >
            <div class="q-ma-md">
                <card-avatar :id="cardId" />
                <div>{{ $t(`magic.format.${format}`) }} {{ data }} {{ scryfall }}</div>
            </div>
        </grid>
    </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed } from 'vue';

import controlSetup from 'src/setup/control';

import Grid from 'src/components/Grid.vue';
import CardAvatar from '../CardAvatar.vue';

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

            const ws = controlWs('/magic/format/assign-legality');
            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    progress.value = JSON.parse(data) as Status;
                };
                ws.onerror = reject;
                ws.onclose = resolve;
            });
        };

        return {
            assign,
            progress,
            progressValue,
            progressLabel,
        };
    },
});
</script>
