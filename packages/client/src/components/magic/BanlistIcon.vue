<template>
    <q-icon
        :name="icon"
        :class="'banlist-status-' + status"
    />
</template>

<style lang="sass" scoped>
.banlist-status-banned,
.banlist-status-suspended,
.banlist-status-banned_as_commander,
.banlist-status-banned_as_companion,
.color-negative
    color: #F33

.banlist-status-restricted
    color: #EA0

.banlist-status-legal,
.color-positive
    color: #0A0

.banlist-status-unavailable
    color: #777
</style>

<script lang="ts">
import { PropType, defineComponent, computed } from 'vue';

type BanlistStatus =
    'legal' | 'restricted' | 'suspended' | 'banned' | 'banned_as_commander' | 'banned_as_companion' | 'unavailable';

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
                return 'mdi-progress-close';
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
