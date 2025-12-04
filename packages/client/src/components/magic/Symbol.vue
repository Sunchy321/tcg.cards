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

            if (type.includes('cost')) {
                klass += ' cost';

                if (!type.includes('flat')) {
                    klass += ' shadow';
                }
            }

            if (type.includes('flat')) {
                klass += ' flat';
            }

            if (type.includes('mini')) {
                klass += ' mini';
            }

            if (type.includes('tap:old1')) {
                klass += ' tap-old1';
            }

            if (type.includes('tap:old2')) {
                klass += ' tap-old2';
            }

            if (type.includes('white:old')) {
                klass += ' white-old';
            }

            return h('span', { class: klass }, props.value);
        };
    },
});
</script>
