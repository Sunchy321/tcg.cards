<template>
    <Milkdown />
</template>

<script setup lang="ts">
import { Milkdown, useEditor } from '@milkdown/vue';

import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

import { $inputRule, $node, $remark } from '@milkdown/utils';
import { nodeRule } from '@milkdown/kit/prose';
import { visit } from 'unist-util-visit';

import { escapeRegExp } from 'lodash';
import { symbols } from '@model/magic/schema/basic';

const ALLOWED = symbols;
const allowedPattern = ALLOWED.map(escapeRegExp).join('|');
const regex = new RegExp(`\\{(${allowedPattern})\\}`, 'g');

const remarkMagicSymbol = $remark('remarkMagicSymbol', () => () => tree => {
    visit(tree, 'text', (node: any, index: any, parent: any) => {
        if (!parent || index === undefined) return;

        const value = node.value as string;
        const matches = [...value.matchAll(regex)];

        if (matches.length === 0) return;

        const children: any[] = [];
        let lastIndex = 0;

        for (const match of matches) {
            if (match.index! > lastIndex) {
                children.push({ type: 'text', value: value.slice(lastIndex, match.index) });
            }
            children.push({ type: 'magicSymbol', value: match[1] });
            lastIndex = match.index! + match[0].length;
        }

        if (lastIndex < value.length) {
            children.push({ type: 'text', value: value.slice(lastIndex) });
        }

        parent.children.splice(index, 1, ...children);
    });
});

const magicSymbolNode = $node('magicSymbol', () => ({
    group:  'inline',
    inline: true,
    atom:   true,
    attrs:  {
        value: { default: '' },
    },
    parseDOM: [{
        tag:      'span.magic-symbol',
        getAttrs: (dom: HTMLElement) => ({ value: dom.textContent }),
    }],
    toDOM:         (node: any) => ['span', { class: 'magic-symbol' }, `{${node.attrs.value}}`],
    parseMarkdown: {
        match:  (node: any) => node.type === 'magicSymbol',
        runner: (state: any, node: any, type: any) => {
            state.addNode(type, { value: node.value });
        },
    },
    toMarkdown: {
        match:  (node: any) => node.type.name === 'magicSymbol',
        runner: (state: any, node: any) => {
            state.addNode('text', undefined, `{${node.attrs.value}}`);
        },
    },
}));

const magicSymbolInputRule = $inputRule(ctx => {
    const ruleRegex = new RegExp(`\\{(${allowedPattern})\\}`);
    return nodeRule(ruleRegex, magicSymbolNode.type(ctx), {
        getAttr(match) {
            return { value: match[1] };
        },
    });
});

const model = defineModel<string>();

useEditor(root => {
    const crepe = new Crepe({
        root,
        defaultValue: model.value,
    });

    crepe.editor
        .use(remarkMagicSymbol)
        .use(magicSymbolNode)
        .use(magicSymbolInputRule);

    crepe.on(listener => {
        listener.markdownUpdated((ctx: any, md: string) => {
            model.value = md;
        });
    });

    return crepe;
});

</script>
