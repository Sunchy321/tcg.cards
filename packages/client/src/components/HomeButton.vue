<template>
    <q-btn
        flat dense round
        :to="homePath"
        @mousedown.left.prevent.stop="start"
        @touchstart.prevent.stop="start"
        @keydown.enter.prevent.stop="start"
        @mouseup.left.prevent.stop="stop"
        @touchend.prevent.stop="stop"
        @keyup.enter.prevent.stop="stop"
        @mouseleave.left.prevent.stop="cancel"
    >
        <q-icon
            v-if="holdTime < showTime"
            :class="{ 'convert-white': homeIcon.startsWith('img:') }"
            :name="homeIcon"
        />
        <q-circular-progress
            v-else
            show-value
            instant-feedback
            size="md"
            :value="(holdTime - showTime) / (baseRouteTime - showTime) * 100"
            color="white"
        >
            <q-icon
                :class="{ 'convert-white': homeIcon.startsWith('img:') }"
                size="24px"
                :name="homeIcon"
            />
        </q-circular-progress>
    </q-btn>
</template>

<script lang="ts">
import {
    defineComponent, ref, computed, watch,
} from 'vue';

import { useRouter, useRoute } from 'vue-router';

import basicSetup from 'setup/basic';

export default defineComponent({
    props: {
        drawerOpen: { type: Boolean, default: undefined },
    },

    emits: ['update:drawerOpen'],

    setup() {
        const router = useRouter();
        const route = useRoute();
        const { game } = basicSetup();

        const showTime = 1000;
        const baseRouteTime = 2000;
        const interval = 10;

        const holdTime = ref(0);

        const homePath = computed(() => {
            if (game.value == null) {
                return '/';
            } else {
                return `/${game.value}`;
            }
        });

        const homeIcon = computed(() => {
            if (game.value == null || holdTime.value >= showTime) {
                return 'mdi-home';
            }

            return `img:/${game.value}/logo.svg`;
        });

        let startTime = 0;
        let holdId = 0;

        const stopHold = () => {
            if (holdId !== 0) {
                clearInterval(holdId);
                startTime = 0;
                holdId = 0;
                holdTime.value = 0;
            }
        };

        const hold = () => {
            const duration = Date.now() - startTime;

            if (duration > baseRouteTime) {
                stopHold();
                router.push('/');
            } else {
                holdTime.value = duration;
            }
        };

        const start = () => {
            startTime = Date.now();
            holdId = setInterval(hold, interval);
        };

        const stop = () => {
            if (holdId !== 0) {
                stopHold();
                router.push(homePath.value);
            }
        };

        const cancel = () => {
            stopHold();
        };

        watch(route, stopHold);

        return {
            homeIcon,
            homePath,

            holdTime,
            showTime,
            baseRouteTime,
            start,
            stop,
            cancel,
        };
    },
});
</script>

<style lang="sass" scoped>
.convert-white
    filter: invert(99%) sepia(70%) saturate(62%) hue-rotate(350deg) brightness(114%) contrast(100%)
</style>
