<template>
    <div class="hsdata-patch row items-center">
        <div class="version">{{ version }}</div>

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

        <span v-if="duplicate > 0" class="duplicate">{{ duplicate }}</span>

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

import controlSetup from 'setup/control';

const props = defineProps<{
    version:   string;
    number:    number;
    isUpdated: boolean;
    duplicate: number;
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

const { controlWs } = controlSetup();

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
    const ws = controlWs('/hearthstone/hsdata/clear-patch', { version: props.number });

    return new Promise((resolve, reject) => {
        ws.onmessage = ({ data }) => {
            if (data.error != null) {
                console.error(data);
            } else {
                const prog = JSON.parse(data) as Progress;
                progress.value = prog;
            }
        };

        ws.onerror = reject;
        ws.onclose = () => {
            progress.value = undefined;
            emit('load-data');

            resolve(undefined);
        };
    });
};

const loadPatch = async () => {
    progress.value = null;

    const ws = controlWs('/hearthstone/hsdata/load-patch', { version: props.number });

    return new Promise((resolve, reject) => {
        ws.onmessage = ({ data }) => {
            if (data.error != null) {
                console.error(data);
            } else {
                const prog = JSON.parse(data) as Progress;
                progress.value = prog;
            }
        };

        ws.onerror = reject;
        ws.onclose = () => {
            progress.value = undefined;
            emit('load-data');

            resolve(undefined);
        };
    });
};
</script>

<style lang="sass" scoped>
.version
    width: 100px

.duplicate
    color: red

.load-button.is-updated
    color: green

</style>
