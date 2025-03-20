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
            <div>Load Set</div>

            <q-btn flat label="Load" @click="loadSet" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

import controlSetup from 'setup/control';

interface Progress {
    method: 'fix' | 'load';

    amount: {
        updated?: number;
        count:    number;
        total?:   number;
    };

    time?: {
        elapsed:   number;
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

const { controlWs } = controlSetup();

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

        result += `[${prog.method}] `;

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

const loadSet = async () => {
    const ws = controlWs('/magic/mtgjson/load-set');

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
</script>
