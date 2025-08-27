<template>
    <div class="q-pa-md">
        <div class="row items-center">
            <q-btn class="q-mr-md" dense outline @click="syncLoc">Sync Localizations</q-btn>
            <q-btn dense outline @click="refresh">Refresh</q-btn>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useQuasar } from 'quasar';

import { trpc } from 'src/trpc';

const quasar = useQuasar();

const syncLoc = async () => {
    await trpc.omni.syncLoc();

    quasar.notify({
        type:    'positive',
        message: 'Sync completed',
    });
};

const refresh = async () => {
    await trpc.omni.refresh();

    quasar.notify({
        type:    'positive',
        message: 'Refresh completed',
    });
};

</script>
