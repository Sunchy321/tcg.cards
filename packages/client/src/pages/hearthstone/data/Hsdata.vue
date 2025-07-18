<template>
    <q-page class="q-pa-md">
        <div class="q-mb-lg row items-center">
            <q-btn
                class="q-mr-md"
                flat dense round
                icon="mdi-download"
                @click="pullRepo"
            />

            <q-btn
                class="q-mr-md"
                flat dense round
                icon="mdi-merge"
                @click="importPatches"
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
        <grid v-slot="{ name, buildNumber, isUpdated }" :value="sortedPatches" :item-width="300">
            <hsdata-patch
                :key="buildNumber"
                :build-number="buildNumber"
                :name="name"
                :is-updated="isUpdated"
                @load-data="loadData"
            />
        </grid>
    </q-page>
</template>

<script setup lang="ts">
import {
    ref, computed, onMounted,
} from 'vue';

import controlSetup from 'setup/control';

import Grid from 'components/Grid.vue';
import HsdataPatch from 'components/hearthstone/data/HsdataPatch.vue';

import type { Patch } from '@interface/hearthstone/patch';

import bytes from 'bytes';

import { apiGet } from 'src/boot/server';

interface TransferProgress {
    type:            'get';
    totalObjects:    number;
    indexedObjects:  number;
    receivedObjects: number;
    localObjects:    number;
    totalDeltas:     number;
    indexedDeltas:   number;
    receivedBytes:   number;
}

interface LoaderProgress {
    type:  'load';
    count: number;
    total: number;
}

interface PatchProgress {
    type:    'clear-patch' | 'load-patch';
    version: number;
    count:   number;
    total:   number;
}

type Progress = LoaderProgress | PatchProgress | TransferProgress;

const { controlWs } = controlSetup();

const patches = ref<Patch[]>([]);
const progress = ref<Progress | undefined>(undefined);

const sortedPatches = computed(() => [
    ...patches.value.filter(v => !v.isUpdated).sort((a, b) => a.buildNumber - b.buildNumber),
    ...patches.value.filter(v => v.isUpdated).sort((a, b) => a.buildNumber - b.buildNumber),
]);

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

const pullRepo = async () => {
    const ws = controlWs('/hearthstone/hsdata/pull-repo');

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

const importPatches = async () => {
    const ws = controlWs('/hearthstone/hsdata/import-patch');

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
    const patch = patches.value.filter(v => !v.isUpdated).sort((a, b) => a.buildNumber - b.buildNumber)[0];

    if (patch == null) {
        return;
    }

    const ws = controlWs('/hearthstone/hsdata/load-patch', { number: patch.buildNumber });

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

    loadPatches();
};

onMounted(loadData);
</script>
