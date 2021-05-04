<style lang="sass" scoped>
.magic-symbol
    transform: translateY(10%)

    [lang=zhs] &, [lang=zht] &
        transform: translateY(15%)
        margin-left: 2px

    [lang=zhs] & + span, [lang=zht] & + span
        margin-left: 2px

    [lang=zhs] & + &, [lang=zht] & + &,
    [lang=zhs] &:first-child, [lang=zht] &:first-child,
    br + &
        margin-left: 0px !important
</style>

<script lang="ts">
import { VNode, PropType, defineComponent, h } from 'vue';

import { useStore } from 'src/store';

import Symbol from './Symbol.vue';

export default defineComponent({
    props: {
        symbol: {
            type:    Array as PropType<string[]>,
            default: () => [],
        },
    },

    setup(props, { attrs, slots }) {
        const store = useStore();

        const symbols = store.getters['magic/data'].symbols || [];
        const symbolType = props.symbol ?? [];

        return () => {
            const defaultSlot = slots.default!();

            const result: (string | VNode)[] = [];

            for (const node of defaultSlot) {
                if (typeof node.children === 'string') {
                    const pieces = node.children.split(/(\n|\{[^}]+\})/).filter(v => v !== '');

                    for (const p of pieces) {
                        if (p === '\n') {
                            result.push(h('br'));
                        } else if (p.startsWith('{') && p.endsWith('}')) {
                            const content = p.slice(1, -1);

                            if (symbols.includes(content)) {
                                result.push(h(Symbol, {
                                    class: attrs.class,
                                    value: content,
                                    type:  symbolType,
                                }));
                            } else {
                                result.push(h('span', {
                                    class: attrs.class,
                                }, p));
                            }
                        } else {
                            result.push(h('span', {
                                class: attrs.class,
                            }, p));
                        }
                    }
                } else {
                    result.push(node);
                }
            }

            return result;
        };
    },
});
</script>
