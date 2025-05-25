<template>
    <div class="q-pa-md">
        <div class="row justify-center">
            <q-btn
                class="q-ml-md"
                flat dense round
                icon="mdi-play"
                @click="getImage"
            />
        </div>

        <div v-if="progress != null" class="q-my-md row justify-center">
            {{ progress.current.set }}:{{ progress.current.lang }}
            {{ progress.overall.count }}/{{ progress.overall.total }}

            ({{ progress.failed }})
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

<script setup lang="ts">
import { ref, computed } from 'vue';

import controlSetup from 'setup/control';

interface Progress {
    overall: { count: number, total: number };
    current: { set: string, lang: string };
    status:  Record<string, string>;
    failed:  number;
}

const { controlWs } = controlSetup();

const progress = ref<Progress | null>(null);

const status = computed(() => progress.value?.status ?? {});

const statusKey = computed(() => Object.keys(status.value));

const getImage = async () => {
    progress.value = null;

    const ws = controlWs('/ptcg/image/get');

    return new Promise((resolve, reject) => {
        ws.onmessage = ({ data }) => {
            const prog = JSON.parse(data) as Progress;

            if (prog?.current?.set != null) {
                progress.value = prog;
            }
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

    width: 35px
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

    &.status-exists
        background-color: seagreen
        color: white
</style>
