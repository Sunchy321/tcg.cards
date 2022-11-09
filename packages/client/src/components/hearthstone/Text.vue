<style lang="sass" scoped>
.card
    display: inline
    text-decoration: underline

.emph
    font-weight: italic
</style>

<script lang="ts">
import type { VNode } from 'vue';
import { defineComponent, h } from 'vue';

export default defineComponent({
    props: {
        disableNewline: { type: Boolean, default: false },
        detectUrl:      { type: Boolean, default: false },
    },

    setup(props, { attrs, slots }) {
        const render = (text: string) => {
            const result: (VNode | string)[] = [];

            const regex = new RegExp(`(${[
                '<b>(?:(?:.|\n)*?)</b>',
                '<i>(?:(?:.|\n)*?)</i>',
                '\\n',
                ...props.detectUrl ? ['https?://[-a-zA-Z0-9/.?=&]+[-a-zA-Z0-9/]'] : [],
            ].join('|')})`);

            const pieces = text.split(regex).filter(v => v !== '');

            for (const p of pieces) {
                if (p === '\n') {
                    if (props.disableNewline) {
                        result.push(' ');
                    } else {
                        result.push(h('br'));
                    }
                    continue;
                }

                if (p.startsWith('<b>')) {
                    const content = p.slice(3, -4);
                    result.push(h('strong', render(content)));
                    continue;
                }

                if (p.startsWith('<i>')) {
                    const content = p.slice(3, -4);
                    result.push(h('em', render(content)));
                    continue;
                }

                if (props.detectUrl && /^https?:/.test(p)) {
                    result.push(h('a', {
                        href:   p.replace(/^http:/, 'https:'),
                        target: '_blank',
                    }, p));

                    continue;
                }

                result.push(h('span', {
                    class: attrs.class,
                }, p));
            }

            return result;
        };

        return () => {
            const defaultSlot = slots.default!();

            const result: (VNode | string)[] = [];

            for (const node of defaultSlot) {
                if (typeof node.children === 'string' && typeof node.type === 'symbol') {
                    result.push(...render(node.children));
                } else {
                    result.push(node);
                }
            }

            return result;
        };
    },
});
</script>
