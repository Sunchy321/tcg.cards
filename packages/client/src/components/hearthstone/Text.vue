<template>
    <final-render />
</template>

<script setup lang="ts">
import type { VNode } from 'vue';
import { h } from 'vue';

const props = withDefaults(defineProps<{
    disableNewline?: boolean;
    detectUrl?: boolean;
}>(), {
    disableNewline: false,
    detectUrl:      false,
});

// eslint-disable-next-line no-spaced-func
const slots = defineSlots<{
    default: () => VNode[];
}>();

const render = (text: string) => {
    const result: (VNode | string)[] = [];

    const regex = new RegExp(`(${[
        '<b>(?:(?:<b>.*?</b>|.|\n)*?)</b>',
        '<i>(?:(?:<i>.*?</i>|.|\n)*?)</i>',
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

        result.push(h('span', p));
    }

    return result;
};

const finalRender = () => {
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
</script>

<style lang="sass" scoped>
.card
    display: inline
    text-decoration: underline

.emph
    font-weight: italic
</style>
