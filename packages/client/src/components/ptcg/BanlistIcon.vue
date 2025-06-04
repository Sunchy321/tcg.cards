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

import { Legality } from '@interface/ptcg/format-change';

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
    case 'legal':
        return 'mdi-check-circle-outline';
    case 'banned':
        return 'mdi-close-circle-outline';
    case 'unavailable':
        return 'mdi-cancel';
    default:
        if (score.value != null) {
            if (score.value > 9) {
                return 'mdi-numeric-9-plus-circle-outline';
            } else {
                return `mdi-numeric-${score.value}-circle-outline`;
            }
        } else {
            return 'mdi-help-circle-outline';
        }
    }
});

const tooltip = computed(() => {
    if (score.value != null) {
        return score;
    } else {
        return i18n.t(`ptcg.legality.${status}`);
    }
});
</script>
