<template>
    <q-icon
        :name="icon"
        :class="klass"
    >
        <q-tooltip>
            {{ tooltip }}
        </q-tooltip>
    </q-icon>
</template>

<script lang="ts">
import { PropType, defineComponent, computed } from 'vue';

import { useI18n } from 'vue-i18n';

import { Legality, Adjustment } from 'interface/hearthstone/format-change';

export default defineComponent({
    props: {
        status: {
            type:     String as PropType<Adjustment | Legality>,
            required: true,
        },
    },

    setup(props) {
        const i18n = useI18n();

        const icon = computed(() => {
            switch (props.status) {
            case 'banned':
                return 'mdi-close-circle-outline';
            case 'legal':
                return 'mdi-check-circle-outline';
            case 'banned_in_deck':
                return 'mdi-minus-circle-outline';
            case 'banned_in_card_pool':
                return 'mdi-star-circle-outline';
            case 'unavailable':
                return 'mdi-cancel';
            case 'nerf':
                return 'mdi-arrow-down-thin-circle-outline';
            case 'buff':
                return 'mdi-arrow-up-thin-circle-outline';
            case 'adjust':
                return 'mdi-asterisk-circle-outline';
            default:
                return '';
            }
        });

        const isAdjustment = computed(() => ['nerf', 'buff', 'adjust'].includes(props.status));

        const klass = computed(() => {
            if (isAdjustment.value) {
                return `hearthstone-adjustment-${props.status}`;
            } else {
                return `hearthstone-legality-${props.status}`;
            }
        });

        const tooltip = computed(() => {
            if (isAdjustment.value) {
                return i18n.t(`hearthstone.adjustment.${props.status}`);
            } else {
                return i18n.t(`hearthstone.legality.${props.status}`);
            }
        });

        return {
            icon,
            klass,
            tooltip,
        };
    },
});
</script>
