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

import { useParam } from 'store/core';

import { Patch } from '@model/hearthstone/schema/patch';

import { trpc } from 'src/trpc';

const patches = ref<Patch[]>([]);

const version = useParam('version', {
    type:    'string',
    bind:    'query',
    default: () => patches.value[0]?.buildNumber.toString() ?? '',
});

const versions = computed(() => patches.value.map(p => p.buildNumber.toString()));

const data = computed(() => {
    const patch = patches.value.find(p => p.buildNumber.toString() === version.value);

    if (patch != null) {
        return patch;
    } else {
        return null;
    }
});

const fullName = computed(() => data.value?.name ?? '');

const shortName = computed({
    get() { return data.value?.shortName ?? ''; },
    set(newValue: string) {
        if (data.value != null) {
            data.value.shortName = newValue;
        }
    },
});

const save = async () => {
    if (data.value == null) {
        return;
    }

    await trpc.hearthstone.patch.save(data.value);
};

const loadList = async () => {
    patches.value = await trpc.hearthstone.patch.list();
};

onMounted(loadList);
</script>
