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
</style>

<script lang="ts">
import { defineComponent, ref, computed } from 'vue';

import { useRouter, useRoute } from 'vue-router';

import contorlSetup from 'setup/control';

interface Progress {
    overall: { count: number, total: number }
    current: { set: string, lang: string; }
    status: Record<string, string>
}

export default defineComponent({
    setup() {
        const router = useRouter();
        const route = useRoute();

        const { controlWs } = contorlSetup();

        const progress = ref<Progress|null>(null);

        const types = ['png', 'large', 'normal', 'small', 'art_crop', 'border_crop'];

        const typeOptions = types.map(t => ({
            value: t, label: t,
        }));

        const type = computed({
            get() { return route.query.type as string ?? 'large'; },
            set(newValue: string) { void router.replace({ query: { type: newValue } }); },
        });

        const status = computed(() => progress.value?.status ?? {});

        const statusKey = computed(() => {
            return Object.keys(status.value).sort((a, b) => {
                const ma = /^(.*?)(?:-\d|[ab])?$/.exec(a)![1];
                const mb = /^(.*?)(?:-\d|[ab])?$/.exec(b)![1];

                const len = Math.max(ma.length, mb.length);

                const pa = ma.padStart(len, '0');
                const pb = mb.padStart(len, '0');

                return pa < pb ? -1 : pa > pb ? 1 : 0;
            });
        });

        const getImage = async() => {
            progress.value = null;

            const ws = controlWs('/magic/image/get', { type: type.value });

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

        return {
            type,
            progress,
            status,
            statusKey,

            typeOptions,

            getImage,
        };
    },
});
</script>
