<template>
    <div class="q-pa-md">
        <div class="q-mb-md row justify-center items-center">
            <span v-if="progress != null" class="q-mr-md">
                {{ progress.overall.count }}/{{ progress.overall.total }}

                ({{ formatTime(progress.time.remaining) }})

                ({{ progress.failed }})
            </span>

            <q-btn
                class="q-ml-md"
                flat dense round
                icon="mdi-play"
                @click="getImage"
            />
        </div>

        <div v-if="progress != null">
            <span
                v-for="k in statusKey"
                :key="k"
                class="single-status" :class="`status-${status[k]}`"
            >{{ k }}</span>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed } from 'vue';

import controlSetup from 'setup/control';

interface Progress {
    overall: { count: number, total: number };
    time:    { elapsed: number, remaining: number };
    status:  Record<string, string>;
    failed:  number;
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
    setup() {
        const { controlWs } = controlSetup();

        const progress = ref<Progress | null>(null);

        const status = computed(() => progress.value?.status ?? {});

        const statusKey = computed(() => Object.keys(status.value));

        const getImage = async () => {
            progress.value = null;

            const ws = controlWs('/hearthstone/hsdata/get-image');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    const prog = JSON.parse(data) as Progress;

                    progress.value = prog;
                };

                ws.onerror = reject;
                ws.onclose = () => { resolve(undefined); };
            });
        };

        return {
            progress,
            status,
            statusKey,

            getImage,
            formatTime,
        };
    },
});
</script>

<style lang="sass" scoped>
.single-status
    display: inline-flex
    justify-content: center
    align-items: center

    width: 12.5%
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
