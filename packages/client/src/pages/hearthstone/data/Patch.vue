<template>
    <q-page class="q-pa-md">
        <div class="row items-center q-mb-md q-gutter-md">
            <q-select
                v-model="version"
                dense outlined
                input-debounce="0"
                :options="versions"
            />

            <div class="q-ml-md">{{ fullName }}</div>

            <q-space />

            <q-btn
                icon="mdi-upload"
                flat dense round
                @click="save"
            />
        </div>

        <div>
            <q-input v-model="shortName" dense outlined placeholder="Short Name" />
        </div>
    </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

import controlSetup from 'src/setup/control';

import { Patch } from '@interface/hearthstone/patch';

import { apiGet } from 'boot/server';
import pageSetup from 'src/setup/page';

const { controlPost } = controlSetup();

const patches = ref<Patch[]>([]);

const { version } = pageSetup({
    appendParam: true,
    params:      {
        version: {
            type:    'string',
            bind:    'query',
            default: () => patches.value[0]?.number.toString() ?? 0,
        },
    },
});

const versions = computed(() => patches.value.map(p => p.number.toString()));

const data = computed(() => {
    const patch = patches.value.find(p => p.number.toString() === version.value);

    if (patch != null) {
        return patch;
    } else {
        return null;
    }
});

const fullName = computed(() => data.value?.version ?? '');

const shortName = computed({
    get() { return data.value?.shortName ?? ''; },
    set(newValue: string) {
        if (data.value != null) {
            data.value.shortName = newValue;
        }
    },
});

const save = async () => {
    if (data.value != null) {
        await controlPost('/hearthstone/patch/save', { data: data.value });
    }
};

const loadList = async () => {
    const { data: patchList } = await apiGet<Patch[]>('/hearthstone/patch');

    patches.value = patchList;
};

onMounted(loadList);
</script>
