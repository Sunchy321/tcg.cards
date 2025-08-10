<template>
    <div class="q-pa-md">
        <div class="row">
            <q-btn dence outline @click="createPatchJson">
                Create Patch JSON
            </q-btn>

            <q-input v-model="version" class="q-ml-sm" flat dense outlined />

            <q-btn class="q-ml-md" dense outline @click="createAdjustmentJson">Create Adjustment JSON</q-btn>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useParam } from 'store/core';

import controlSetup from 'src/setup/control';
import { trpc } from 'src/hono';

const { controlPost } = controlSetup();

const version = useParam('version', {
    type:    'number',
    bind:    'query',
    default: 0,
});

const createPatchJson = async () => {
    const res = await trpc.hearthstone.data.apollo['create-patch-json'].$post({
        query: {
            version: version.value.toString(),
        },
    });

    try {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'change_card.json';
        document.body.appendChild(link);
        link.click();

        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error(e);
    }
};

const createAdjustmentJson = async () => {
    const { data } = await controlPost('/hearthstone/apollo/create-adjustment-json');

    try {
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'change_card.json';
        document.body.appendChild(link);
        link.click();

        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error saving JSON file:', error);
    }
};

</script>
