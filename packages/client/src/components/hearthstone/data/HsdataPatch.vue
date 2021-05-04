<template>
    <div class="hsdata-patch row items-center">
        <div>{{ version }}</div>

        <q-btn
            class="load-button"
            :class="{ 'is-updated': isUpdated }"
            flat round dense
            icon="mdi-import"
            @click="loadPatch"
        />

        <q-circular-progress
            v-show="progress != null"
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

<style lang="sass" scoped>
.hsdata-patch
    width: 20%
    padding: 10px 5px

.load-button.is-updated
    color: green
</style>

<script lang="ts">
import { defineComponent, ref, computed } from 'vue';

import controlSetup from 'setup/control';

interface Progress {
    type: 'load-patch';
    version: string;
    count: number;
    total: number;
}

export default defineComponent({
    props: {
        version: {
            type:     String,
            required: true,
        },

        isUpdated: {
            type:     Boolean,
            required: true,
        },
    },

    emits: ['load-data'],

    setup(props, { emit }) {
        const { controlWs } = controlSetup();

        const progress = ref<Progress|null>(null);

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

        const loadPatch = () => {
            const ws = controlWs('/hearthstone/hsdata/load-patch', { version: props.version });

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    if (data.error) {
                        console.error(data);
                    } else {
                        const prog = JSON.parse(data) as Progress;
                        progress.value = prog;
                    }
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    progress.value = null;
                    emit('load-data');

                    resolve(undefined);
                };
            });
        };

        return {
            progress,
            progressValue,
            progressLabel,

            loadPatch,
        };
    },
});
</script>
