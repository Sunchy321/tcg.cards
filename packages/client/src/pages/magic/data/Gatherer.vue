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

        <div class="row items-center">
            <div>Get Gatherer</div>

            <q-input v-model="set" class="q-mx-md col-grow" dense outlined />

            <q-btn flat label="Get" @click="getGatherer" />
        </div>
    </div>
</template>

<script lang="ts">
import {
    defineComponent, ref, computed,
} from 'vue';

import controlSetup from 'setup/control';

import bytes from 'bytes';

interface Progress {
    method: string;
    type: string;

    amount: {
        updated?: number;
        count: number;
        total?: number;
    };

    time?: {
        elapsed: number;
        remaining: number;
    };
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
    name: 'DataScryfall',

    setup() {
        const { controlWs } = controlSetup();

        const set = ref<string>('');

        const progress = ref<Progress | null>(null);

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

                result += `[${prog.method}] ${prog.type}: `;

                if (prog.method === 'get' && !['set', 'image'].includes(prog.type)) {
                    result += bytes(prog.amount.count);

                    if (prog.amount.total != null) {
                        result += `/${bytes(prog.amount.total)}`;
                    }
                } else {
                    if (prog.amount.updated != null) {
                        result += `${prog.amount.updated},`;
                    }

                    result += prog.amount.count;

                    if (prog.amount.total != null) {
                        result += `/${prog.amount.total}`;
                    }
                }

                if (prog.time != null) {
                    result += ` (${formatTime(prog.time.remaining)})`;
                }

                return result;
            } else {
                return '';
            }
        });

        const getGatherer = async () => {
            const ws = controlWs('/magic/card/get-gatherer', { set: set.value });

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    progress.value = JSON.parse(data) as Progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    progress.value = null;

                    resolve(undefined);
                };
            });
        };

        return {
            set,

            progress,
            progressValue,
            progressLabel,

            getGatherer,
        };
    },
});
</script>
