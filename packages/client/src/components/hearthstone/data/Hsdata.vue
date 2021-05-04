<template>
    <q-page class="q-pa-md">
        <div class="q-mb-lg row items-center">
            <q-btn
                class="q-mr-md"
                flat dense round
                icon="mdi-merge"
                @click="loadHsdata"
            />

            <div v-if="progress != null" class="q-mr-sm">
                {{ progressLabel }}
            </div>

            <q-linear-progress
                v-if="progress != null"
                class="flex-grow"
                rounded
                color="primary"
                :indeterminate="progressValue == null"
                :value="progressValue"
                size="15px"
            />
        </div>
        <div class="row justify-between">
            <hsdata-patch
                v-for="p in patches"
                :key="p.version"
                v-bind="p"
                @load-data="loadData"
            />
        </div>
    </q-page>
</template>

<style lang="sass" scoped>
.flex-grow
    flex-grow: 1
    width: inherit
</style>

<script lang="ts">
import { defineComponent, ref, computed, onMounted } from 'vue';

import controlSetup from 'setup/control';

import HsdataPatch from './HsdataPatch.vue';

import bytes from 'bytes';

interface Patch {
    version: string;
    number: number;
    sha: string;
    isUpdated: boolean;
}

interface TransferProgress {
    type: 'get';
    totalObjects: number;
    indexedObjects: number;
    receivedObjects: number;
    localObjects: number;
    totalDeltas: number;
    indexedDeltas: number;
    receivedBytes: number;
}

interface LoaderProgress {
    type: 'load',
    count: number,
    total: number
}

type Progress = TransferProgress | LoaderProgress;

export default defineComponent({
    components: { HsdataPatch },

    setup() {
        const { controlGet, controlWs } = controlSetup();

        const patches = ref<Patch[]>([]);
        const progress = ref<Progress|null>(null);

        const progressValue = computed(() => {
            const prog = progress.value;

            if (prog == null) {
                return null;
            }

            if (prog.type === 'get') {
                if (prog.totalDeltas != null) {
                    return prog.indexedObjects / prog.totalObjects;
                } else {
                    return prog.receivedObjects / prog.totalObjects;
                }
            } else if (prog.type === 'load') {
                return prog.count / prog.total;
            } else {
                return null;
            }
        });

        const progressLabel = computed(() => {
            const prog = progress.value;

            if (prog == null) {
                return null;
            }

            if (prog.type === 'get') {
                return `${prog.indexedObjects}/${prog.receivedObjects}/${prog.totalObjects} (${bytes(prog.receivedBytes)})`;
            } else if (prog.type === 'load') {
                return `${prog.count}/${prog.total}`;
            } else {
                return null;
            }
        });

        const loadData = async () => {
            const { data } = await controlGet<Patch[]>('/hearthstone/patches');

            patches.value = data;
        };

        const getHsdata = async () => {
            const ws = controlWs('/hearthstone/hsdata/get-data');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    progress.value = JSON.parse(data) as TransferProgress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    progress.value = null;
                    void loadData();

                    resolve(undefined);
                };
            });
        };

        const loadHsdata = async () => {
            const ws = controlWs('/hearthstone/hsdata/load-data');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    progress.value = JSON.parse(data) as LoaderProgress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    progress.value = null;
                    void loadData();

                    resolve(undefined);
                };
            });
        };

        onMounted(loadData);

        return {
            patches,
            progress,
            progressValue,
            progressLabel,

            loadData,
            getHsdata,
            loadHsdata,
        };
    },
});
</script>
