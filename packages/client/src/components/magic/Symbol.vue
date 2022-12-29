<style lang="sass">
.magic-symbol
    font-family: magic-symbol
    display: inline-block

    &.tap-old1
        font-feature-settings: 'ss01'

        &.white-old
            font-feature-settings: 'ss01', 'ss03'

    &.tap-old2
        font-feature-settings: 'ss02'

        &.white-old
            font-feature-settings: 'ss02', 'ss03'

    &.white-old
        font-feature-settings: 'ss03'

    &.cost
        margin-right: 1px

        &.cost-shadow:not(.icon-HW):not(.icon-HR)
            margin-right: 3px
            border-radius: 100px
            box-shadow: -2px 2px 0 rgba(0,0,0,0.85)

    &.cost.mini
        font-size: 50%

        &.cost-shadow:not(.icon-HW):not(.icon-HR)
            margin-right: 2px
            box-shadow: -1px 1px 0 rgba(0,0,0,0.85)
</style>

<script lang="ts">
import type { PropType } from 'vue';
import { defineComponent, h } from 'vue';

export default defineComponent({
    name: 'MagicSymbol',

    functional: true,

    props: {
        value: {
            type:     String,
            required: true,
        },

        type: {
            type:    Array as PropType<string[]>,
            default: () => ['modern'],
        },
    },

    setup(props) {
        return () => {
            const rawType = props.type;

            const type = [
                ...rawType.filter(t => t !== 'flat-cost'),
                ...rawType.includes('flat-cost') && rawType.includes('cost') ? ['flat'] : [],
            ];

            let klass = 'magic-symbol';

            if (type.includes('tap:old1')) {
                klass += ' tap-old1';
            }

            if (type.includes('tap:old2')) {
                klass += ' tap-old2';
            }

            if (type.includes('white:old')) {
                klass += ' white-old';
            }

            if (type.includes('cost')) {
                klass += ' cost';

                // TODO cost shadow
                // if (!type.includes('flat')) {
                // klass += ' cost-shadow';
                // }
            }

            if (type.includes('mini')) {
                klass += ' mini';
            }

            return h('span', { class: klass }, `{${props.value}}`);
        };
    },
});
</script>
