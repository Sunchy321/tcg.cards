<template>
    <div class="q-pa-md">
        <div class="row justify-center">
            <q-btn-toggle
                v-model="type"
                outline dense
                :options="typeOptions"
            />

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

import { useRouter, useRoute } from 'vue-router';

import { ImageType, imageType } from '@model/magic/schema/data/scryfall/image';

import { trpc } from 'src/trpc';

interface Progress {
    overall: { count: number, total: number };
    current: { set: string, lang: string };
    status:  Record<string, string>;
    failed:  number;
}

const router = useRouter();
const route = useRoute();

const progress = ref<Progress | null>(null);

const typeOptions = imageType.options.map(t => ({
    value: t, label: t,
}));

const type = computed<ImageType>({
    get() { return imageType.safeParse(route.query.type).data ?? 'large'; },
    set(newValue) { void router.replace({ query: { type: newValue } }); },
});

const status = computed(() => progress.value?.status ?? {});

const statusKey = computed(() => Object.keys(status.value));

const getImage = async () => {
    progress.value = null;

    const sse = await trpc.magic.data.scryfall.getImage(type.value);

    for await (const prog of sse) {
        progress.value = prog;
    }
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
