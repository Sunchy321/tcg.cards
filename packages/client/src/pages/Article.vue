<template>
    <q-page>
        <milkdown-provider>
            <milkdown-editor v-model="markdown" />
        </milkdown-provider>

        {{ markdown }}
    </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import { MilkdownProvider } from '@milkdown/vue';

import MilkdownEditor from 'components/MilkdownEditor.vue';

const markdown = ref('');

</script>
