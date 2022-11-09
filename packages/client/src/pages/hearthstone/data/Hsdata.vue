<template>
    <q-page class="q-pa-md">
        <div class="q-mb-lg row items-center">
            <q-btn
                class="q-mr-md"
                flat dense round
                icon="mdi-download"
                @click="getHsdata"
            />

            <q-btn
                class="q-mr-md"
                flat dense round
                icon="mdi-merge"
                @click="loadHsdata"
            />

            <q-btn
                class="q-mr-md"
                flat round dense
                icon="mdi-import"
                @click="loadPatches"
            />

            <div v-if="progress != null" class="q-mr-sm">
                {{ progressLabel }}
            </div>

            <q-linear-progress
                v-if="progress != null"
                class="col-grow"
                rounded
                color="primary"
                :indeterminate="progressValue == null"
                :value="progressValue"
                size="15px"
            />
        </div>
        <grid v-slot="{ version, number, isUpdated }" :value="patches" :item-width="300">
            <hsdata-patch
                :key="number"
                :version="version"
                :number="number"
                :is-updated="isUpdated"
                @load-data="loadData"
            />
        </grid>
    </q-page>
</template>

<script lang="ts">
import {
    defineComponent, ref, computed, onMounted,
} from 'vue';

import controlSetup from 'setup/control';

import Grid from 'components/Grid.vue';
import HsdataPatch from 'components/hearthstone/data/HsdataPatch.vue';

import bytes from 'bytes';

import { apiGet } from 'src/boot/backend';

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
    type: 'load';
    count: number;
    total: number;
}

interface PatchProgress {
    type: 'clear-patch' | 'load-patch';
    version: number;
    count: number;
    total: number;
}

type Progress = LoaderProgress | PatchProgress | TransferProgress;

export default defineComponent({
    components: { Grid, HsdataPatch },

    setup() {
        const { controlWs } = controlSetup();

        const patches = ref<Patch[]>([]);
        const progress = ref<Progress | undefined>(undefined);

        const progressValue = computed(() => {
            const prog = progress.value;

            if (prog == null) {
                return undefined;
            }

            if (prog.type === 'get') {
                if (prog.totalDeltas != null) {
                    return prog.indexedObjects / prog.totalObjects;
                } else {
                    return prog.receivedObjects / prog.totalObjects;
                }
            } else if (prog.type === 'load' || prog.type === 'load-patch') {
                return prog.count / prog.total;
            } else {
                return undefined;
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
            } else if (prog.type === 'load-patch') {
                return `${prog.version}: ${prog.count}/${prog.total}`;
            } else {
                return null;
            }
        });

        const loadData = async () => {
            const { data } = await apiGet<Patch[]>('/hearthstone/patch');

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
                    progress.value = undefined;
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
                    progress.value = undefined;
                    void loadData();

                    resolve(undefined);
                };
            });
        };

        const loadPatches = async () => {
            for (const p of patches.value) {
                if (p.isUpdated) {
                    continue;
                }

                const ws = controlWs('/hearthstone/hsdata/load-patch', { version: p.number });

                await new Promise((resolve, reject) => {
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

                        resolve(undefined);
                    };
                });

                await loadData();
            }
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
            loadPatches,
        };
    },
});
</script>
