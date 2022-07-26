<template>
    <q-icon
        :name="icon"
        :class="'banlist-status-' + status"
    />
</template>

<script lang="ts">
import type { PropType } from 'vue';
import { defineComponent, computed } from 'vue';

type BanlistStatus =
    'banned_as_commander' | 'banned_as_companion' | 'banned' | 'legal' | 'restricted' | 'suspended' | 'unavailable';

export default defineComponent({
    props: {
        status: {
            type:     String as PropType<BanlistStatus>,
            required: true,
        },
    },

    setup(props) {
        const icon = computed(() => {
            switch (props.status) {
            case 'legal':
                return 'mdi-check-circle-outline';
            case 'restricted':
                return 'mdi-alert-circle-outline';
            case 'suspended':
                return 'mdi-minus-circle-outline';
            case 'banned':
                return 'mdi-close-circle-outline';
            case 'banned_as_commander':
                return 'mdi-crown-circle-outline';
            case 'banned_as_companion':
                return 'mdi-heart-circle-outline';
            case 'unavailable':
                return 'mdi-cancel';
            default:
                return 'mdi-help-circle-outline';
            }
        });

        return {
            icon,
        };
    },
});
</script>
