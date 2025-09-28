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

import { Legality } from '@model/magic/schema/game-change';

const i18n = useI18n();

const { status, score } = defineProps<{
    status: Legality;
    score?: number;
}>();

const icon = computed(() => {
    switch (status) {
    case 'legal':
        return 'mdi-check-circle-outline';
    case 'restricted':
        return 'mdi-alert-circle-outline';
    case 'suspended':
        return 'mdi-minus-circle-outline';
    case 'banned':
        return 'mdi-close-circle-outline';
    case 'banned_in_bo1':
        return 'mdi-progress-close';
    case 'banned_as_commander':
        return 'mdi-crown-circle-outline';
    case 'banned_as_companion':
        return 'mdi-heart-circle-outline';
    case 'game_changer':
        return 'mdi-eye-circle-outline';
    case 'unavailable':
        return 'mdi-cancel';
    default:
        if (score != null) {
            if (score > 9) {
                return 'mdi-numeric-9-plus-circle-outline';
            } else {
                return `mdi-numeric-${score}-circle-outline`;
            }
        } else {
            return 'mdi-help-circle-outline';
        }
    }
});

const tooltip = computed(() => {
    if (score != null) {
        return score;
    } else {
        return i18n.t(`magic.legality.${status}`);
    }
});
</script>
