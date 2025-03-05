<template>
    <div class="q-pa-md">
        <q-btn flat dense outline @click="createAdjustmentJson">Create Adjustment JSON</q-btn>
    </div>
</template>

<script setup lang="ts">
import controlSetup from 'src/setup/control';

const { controlPost } = controlSetup();

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
