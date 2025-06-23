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

            <q-btn dense outline class="q-mr-md" label="Get" @click="getGatherer" />
            <q-btn dense outline label="Load Image" @click="loadGathererImage" />
        </div>

        <div v-if="progress != null" class="q-mt-md">
            <span
                v-for="k in statusKey"
                :key="k"
                class="single-status" :class="`status-${statusFor(k)}`"
            >{{ k }} {{ statusTextFor(k) }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

import controlSetup from 'setup/control';

import bytes from 'bytes';

interface Progress {
    method: string;
    type:   string;

    amount: {
        updated?: number;
        count:    number;
        total?:   number;
    };

    time?: {
        elapsed:   number;
        remaining: number;
    };

    status: Record<string, [number, number] | null>;
}

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

const status = computed(() => progress.value?.status ?? {});

const statusKey = computed(() => Object.keys(status.value));

const statusFor = (num: string) => {
    const value = status.value[num];

    if (typeof value === 'string') {
        return value;
    }

    if (value == null || value[1] === 0) {
        return 'waiting';
    } else if (value[0] === value[1]) {
        return 'success';
    } else {
        return 'working';
    }
};

const statusTextFor = (num: string) => {
    const value = status.value[num];

    if (typeof value === 'string') {
        return '';
    }

    if (value == null) {
        return '';
    } else {
        return `${value[0]}/${value[1]}`;
    }
};

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
        ws.onclose = () => { resolve(undefined); };
    });
};

const loadGathererImage = async () => {
    const ws = controlWs('/magic/data/gatherer/load-image', { set: set.value });

    return new Promise((resolve, reject) => {
        ws.onmessage = ({ data }) => {
            progress.value = JSON.parse(data) as Progress;
        };

        ws.onerror = reject;
        ws.onclose = () => { resolve(undefined); };
    });
};

</script>

<style lang="sass" scoped>
.single-status
    display: inline-flex
    justify-content: center
    align-items: center

    width: 70px
    height: 35px
    font-size: 10px

    &.status-success
        background-color: green
        color: white

    &.status-working
        background-color: blue
        color: white

    &.status-failed
        background-color: red
        color: white

    &.status-stopped
        background-color: yellow
</style>
