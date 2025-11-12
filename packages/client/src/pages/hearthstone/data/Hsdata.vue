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
                @click="loadPatchList"
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
import { ref, computed, onMounted } from 'vue';

import Grid from 'components/Grid.vue';
import HsdataPatch from 'components/hearthstone/data/HsdataPatch.vue';

import { Patch } from '@model/hearthstone/schema/patch';
import { LoaderProgress, PatchProgress, PullRepoProgress } from '@model/hearthstone/schema/data/hsdata';

import { trpc } from 'src/trpc';

type Progress = PullRepoProgress | LoaderProgress | PatchProgress;

const patches = ref<Patch[]>([]);
const progress = ref<Progress>();

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
        return prog.progress;
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
        return `${prog.processed}/${prog.total} (${prog.method}/${prog.stage})`;
    } else if (prog.type === 'load') {
        return `${prog.count}/${prog.total}`;
    } else if (prog.type === 'load-patch') {
        return `${prog.version} [${prog.method!}]: ${prog.count}/${prog.total}`;
    } else {
        return null;
    }
});

const loadData = async () => {
    patches.value = await trpc.hearthstone.patch.list();
};

const pullRepo = async () => {
    for await (const prog of await trpc.hearthstone.data.hsdata.pullRepo()) {
        progress.value = prog;
    }
};

const loadPatchList = async () => {
    for await (const prog of await trpc.hearthstone.data.hsdata.loadPatchList()) {
        progress.value = prog;
    }

    await loadData();
};

const loadPatches = async () => {
    const patch = patches.value.filter(v => !v.isUpdated).sort((a, b) => a.buildNumber - b.buildNumber)[0];

    if (patch == null) {
        return;
    }

    for await (const prog of await trpc.hearthstone.data.hsdata.loadPatch(patch.buildNumber)) {
        progress.value = prog;
    }

    await loadData();

    loadPatches();
};

onMounted(loadData);
</script>
