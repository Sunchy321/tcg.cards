<template>
    <render />
</template>

<script setup lang="ts">
import { VNode, h, useAttrs } from 'vue';

import { useLorcana } from 'store/games/lorcana';

const props = withDefaults(defineProps<{
    symbol?: string[];
    detectUrl?: boolean;
    detectEmph?: boolean;
}>(), {
    symbol:     () => [],
    cards:      () => [],
    detectUrl:  false,
    detectEmph: false,
});

const attrs = useAttrs();

// eslint-disable-next-line no-spaced-func
const slots = defineSlots<{
    default: () => VNode[];
}>();

const lorcana = useLorcana();

const render = () => {
    const defaultSlot = slots.default!();

    const result: (VNode | string)[] = [];

    for (const node of defaultSlot) {
        if (typeof node.children === 'string' && typeof node.type === 'symbol') {
            const regex = new RegExp(`(${[
                '[\\n☐]',
                '\\{[^}]+\\}',
                '\\[(?:0|[+-](?:[1-9][0-9]*|X))\\]',
                ...props.detectUrl ? ['https?://[-a-zA-Z0-9/.?=&]+[-a-zA-Z0-9/]'] : [],
                ...props.detectEmph ? ['\\*[^*]+\\*'] : [],
            ].join('|')})`);

            const pieces = node.children.split(regex).filter(v => v !== '');

            for (const p of pieces) {
                if (p === '\n') {
                    result.push(h('br'));
                    continue;
                }

                if (p === '☐') {
                    result.push(h('input', {
                        type:  'checkbox',
                        style: 'vertical-align: middle; transform: translateY(-10%)',
                    }));
                    continue;
                }

                if (p.startsWith('{') && p.endsWith('}')) {
                    const content = p.slice(1, -1);

                    // if (lorcana.symbols.includes(content)) {
                    //     result.push(h(Symbol, {
                    //         class: attrs.class,
                    //         value: p,
                    //         type:  symbolType,
                    //     }));
                    // } else {
                    result.push(h('span', {
                        class: attrs.class,
                    }, p));
                    // }

                    continue;
                }

                if (props.detectUrl && /^https?:/.test(p)) {
                    result.push(h('a', {
                        href:   p.replace(/^http:/, 'https:'),
                        target: '_blank',
                    }, p));

                    continue;
                }

                if (props.detectEmph && p.startsWith('*') && p.endsWith('*')) {
                    result.push(h('span', {
                        class: 'magic-text emph',
                    }, p.slice(1, -1)));

                    continue;
                }

                result.push(h('span', {
                    class: attrs.class,
                }, p));
            }
        } else {
            result.push(node);
        }
    }

    return result;
};
</script>

<style lang="sass">
.magic-text.card
    display: inline
    text-decoration: underline

.magic-text.emph
    font-weight: italic
</style>
