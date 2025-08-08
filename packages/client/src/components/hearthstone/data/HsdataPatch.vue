<template>
    <div class="hsdata-patch row items-center">
        <div class="name">{{ name }}</div>

        <q-btn
            class="clear-button"
            flat round dense
            icon="mdi-close"
            @click="clearPatch"
        />

        <q-btn
            class="load-button" :class="{ 'is-updated': isUpdated }"
            flat round dense
            icon="mdi-import"
            @click="loadPatch"
        />

        <q-circular-progress
            v-show="progress !== undefined"
            :indeterminate="progress === null"
            :value="progressValue"
            font-size="8px"
            :max="1"
            :thickness="0.3"
            color="primary"
            track-color="transparent"
        />

        <span v-show="progress != null" class="q-pl-sm">{{ progressLabel }}</span>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

import { useQuasar } from 'quasar';

import { trpc } from 'src/hono';
import { actionWithProgress } from 'src/progress';

const quasar = useQuasar();

const props = defineProps<{
    buildNumber: number;
    name:        string;
    isUpdated:   boolean;
}>();

const emit = defineEmits<{
    'load-data': [void];
}>();

interface Progress {
    type:    'clear-patch' | 'load-patch';
    version: number;
    count:   number;
    total:   number;
}

const progress = ref<Progress | null>();

const progressValue = computed(() => {
    if (progress.value == null) {
        return 0;
    } else {
        return progress.value.count / progress.value.total;
    }
});

const progressLabel = computed(() => {
    if (progress.value == null) {
        return '';
    } else {
        return `${progress.value.count}/${progress.value.total}`;
    }
});

const clearPatch = async () => {
    const result = await trpc.hearthstone.data.hsdata['clear-patch'].$post({ query: { buildNumber: props.buildNumber.toString() } });

    if (result.ok) {
        const value = await result.json();

        quasar.notify({
            message: `Patch ${props.buildNumber} has been cleared, ${value.deletedEntity.length} entities and ${value.deletedEntityLocalization.length} localizations removed.`,
            color:   'positive',
        });

        emit('load-data');
    }
};

const loadPatch = async () => actionWithProgress<Progress>(
    `${import.meta.env.VITE_SSE_URL}/hearthstone/data/hsdata/load-patch?buildNumber=${props.buildNumber}`,
    prog => {
        progress.value = prog;
    },
    () => {
        progress.value = null;
        emit('load-data');
    },
);

</script>

<style lang="sass" scoped>
.name
    width: 100px

.duplicate
    color: red

.load-button.is-updated
    color: green

</style>
