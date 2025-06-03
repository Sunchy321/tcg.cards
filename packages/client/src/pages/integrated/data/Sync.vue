<template>
    <div class="q-pa-md">
        <div v-if="progress != null" class="row items-center q-mb-md">
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
            <q-btn dense outline @click="sync">Sync</q-btn>
        </div>
    </div>
</template>

<script setup lang="ts">
import {
    ref, computed, watch,
} from 'vue';

import controlSetup from 'setup/control';

import { last } from 'lodash';

type BulkList = string[];

interface Progress {
    method: string;
    type:   string;

    game: string;

    amount: {
        count: number;
        total: number;
    };

    overall: {
        gameCount: number;
        gameTotal: number;

        count: number;
        total: number;
    };

    time: {
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

const bulk = ref<BulkList>([]);

const bulkItem = ref<string>('');

const progress = ref<Progress | null>(null);

const progressValue = computed(() => {
    const prog = progress.value;

    if (prog == null) {
        return undefined;
    }

    return prog.overall.count / prog.overall.total;
});

const progressLabel = computed(() => {
    const prog = progress.value;

    if (prog == null) {
        return '';
    }

    return `[${prog.game}] ${prog.amount.count}/${prog.amount.total} // ${prog.overall.count}/${prog.overall.total} <${prog.overall.gameCount}/${prog.overall.gameTotal}> (${formatTime(prog.time.remaining)})`;
});

const sync = async () => {
    const ws = controlWs('/integrated/sync');

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

watch(bulk, newBulk => {
    bulkItem.value = last(newBulk) ?? '';
});
</script>
