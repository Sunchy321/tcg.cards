<template>
    <q-icon
        :name="icon"
        :class="'banlist-status-' + status"
    >
        <q-tooltip>
            {{ tooltip }}
        </q-tooltip>
    </q-icon>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useI18n } from 'vue-i18n';

import { Legality } from '@interface/yugioh/format-change';

const i18n = useI18n();

const { status } = defineProps<{
    status: Legality;
}>();

const score = computed(() => {
    if (status.startsWith('score-')) {
        return Number.parseInt(status.slice('score-'.length), 10);
    } else {
        return null;
    }
});

const icon = computed(() => {
    switch (status) {
    case 'unlimited':
        return 'mdi-numeric-3-circle-outline';
    case 'forbidden':
        return 'mdi-numeric-0-circle-outline';
    case 'limited':
        return 'mdi-numeric-1-circle-outline';
    case 'semi-limited':
        return 'mdi-numeric-2-circle-outline';
    case 'unavailable':
        return 'mdi-cancel';
    default:
        return 'mdi-help-circle-outline';
    }
});

const tooltip = computed(() => {
    if (score.value != null) {
        return score;
    } else {
        return i18n.t(`yugioh.legality.${status}`);
    }
});
</script>
