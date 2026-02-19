<template>
    <render />
</template>

<script setup lang="ts">
import { VNode, h, computed } from 'vue';

import { RouterLink, useRoute } from 'vue-router';
import { useGame } from 'store/games/magic';

import Symbol from './Symbol.vue';
import CardAvatar from './CardAvatar.vue';

import MarkdownIt from 'markdown-it';
import Token from 'markdown-it/lib/token.mjs';
import StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';
import StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';

import { symbols } from '@model/magic/schema/basic';

const regionImports = import.meta.glob<Record<string, string>>('@data/magic/localization/region/*.yml', {
    import: 'default',
    eager:  true,
});

const regions = Object.fromEntries(
    Object.entries(regionImports).map(([path, data]) => {
        const fileName = path.split('/').pop()?.replace('.yml', '') ?? '';
        return [fileName, data];
    }),
);

const props = withDefaults(defineProps<{
    symbol?:     string[];
    lang?:       string;
    inline?:     boolean;
    detectUrl?:  boolean;
    detectEmph?: boolean;
    detectCr?:   boolean;
}>(), {
    symbol:     () => [],
    lang:       undefined,
    inline:     false,
    detectUrl:  false,
    detectEmph: false,
    detectCr:   false,
});

const slots = defineSlots<{
    default: () => any[];
}>();

const route = useRoute();
const game = useGame();

const lang = computed(() => props.lang ?? game.locale);

// Initialize markdown-it
const md = new MarkdownIt({
    html:    true,
    linkify: props.detectUrl,
    breaks:  true,
});

// Custom plugin: handle symbols {T} and loyalty counters [+1]
md.inline.ruler.before('escape', 'magic_symbol', (state: StateInline, silent: boolean) => {
    const pos = state.pos;
    const src = state.src;

    // Handle {symbol}
    if (src[pos] === '{') {
        const closePos = src.indexOf('}', pos + 1);
        if (closePos !== -1) {
            const content = src.slice(pos + 1, closePos);
            if (symbols.includes(content)) {
                if (!silent) {
                    const token = state.push('magic_symbol', '', 0);
                    token.content = src.slice(pos, closePos + 1);
                }
                state.pos = closePos + 1;
                return true;
            }
        }
    }

    // Handle loyalty counters like [+1], [-1], [0]
    if (src[pos] === '[') {
        const closePos = src.indexOf(']', pos + 1);
        if (closePos !== -1) {
            const content = src.slice(pos + 1, closePos);
            if (/^(?:0|[+-](?:[1-9][0-9]*|X|N))$/.test(content)) {
                if (!silent) {
                    const token = state.push('magic_symbol', '', 0);
                    token.content = src.slice(pos, closePos + 1);
                }
                state.pos = closePos + 1;
                return true;
            }

            // Handle region tags like [US], [EU]
            if (/^[A-Z]{2,}$/.test(content)) {
                if (!silent) {
                    const token = state.push('region_tag', '', 0);
                    token.content = content;
                }
                state.pos = closePos + 1;
                return true;
            }
        }
    }

    return false;
});

// Custom plugin: handle card links @card(id){text}
md.inline.ruler.before('escape', 'card_link', (state: StateInline, silent: boolean) => {
    const pos = state.pos;
    const src = state.src;

    if (src.slice(pos, pos + 6) !== '@card(') {
        return false;
    }

    const match = /@card\((.*?)\)\{(.*?)\}/.exec(src.slice(pos));
    if (!match) {
        return false;
    }

    if (!silent) {
        const token = state.push('card_link', '', 0);
        token.meta = { id: match[1], text: match[2] };
    }

    state.pos = pos + match[0].length;
    return true;
});

// Custom plugin: handle CR rule links
if (props.detectCr) {
    md.core.ruler.after('inline', 'cr_link', state => {
        for (const blockToken of state.tokens) {
            if (blockToken.type !== 'inline') continue;

            const tokens = blockToken.children;
            if (!tokens) continue;

            const newTokens: Token[] = [];

            for (const token of tokens) {
                if (token.type !== 'text') {
                    newTokens.push(token);
                    continue;
                }

                const text = token.content;
                const regex = /(\d+(?:\.\d+[a-z]?)?)/g;
                let lastIndex = 0;
                let match;

                while ((match = regex.exec(text)) !== null) {
                    const index = match.index;

                    // Ensure word boundaries before and after
                    if ((index > 0 && /[a-zA-Z0-9]/.test(text[index - 1]))
                      || (index + match[0].length < text.length && /[a-zA-Z0-9]/.test(text[index + match[0].length]))) {
                        continue;
                    }

                    // Add text before match
                    if (index > lastIndex) {
                        const textToken = new Token('text', '', 0);
                        textToken.content = text.slice(lastIndex, index);
                        newTokens.push(textToken);
                    }

                    // Add cr_link token
                    const linkToken = new Token('cr_link', '', 0);
                    linkToken.content = match[1];
                    newTokens.push(linkToken);

                    lastIndex = index + match[0].length;
                }

                // Add remaining text
                if (lastIndex === 0) {
                    // No matches found, keep original token
                    newTokens.push(token);
                } else if (lastIndex < text.length) {
                    const textToken = new Token('text', '', 0);
                    textToken.content = text.slice(lastIndex);
                    newTokens.push(textToken);
                }
            }

            blockToken.children = newTokens;
        }
    });
}

// Custom plugin: handle checkboxes ☐
md.inline.ruler.before('escape', 'checkbox', (state: StateInline, silent: boolean) => {
    const pos = state.pos;
    const src = state.src;

    if (src[pos] === '☐') {
        if (!silent) {
            state.push('checkbox', '', 0);
        }
        state.pos = pos + 1;
        return true;
    }

    return false;
});

// Custom plugin: handle copyable dividers ====
md.block.ruler.before('hr', 'copyable_hr', (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
    const pos = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    const line = state.src.slice(pos, max);

    if (!/^={20,}$/.test(line)) {
        return false;
    }

    if (silent) {
        return true;
    }

    state.line = startLine + 1;
    const token = state.push('copyable_hr', 'div', 0);
    token.map = [startLine, state.line];
    token.markup = line;

    return true;
});

// Convert markdown-it tokens to VNodes
function tokensToVNodes(tokens: Token[]): (VNode | string)[] {
    const result: (VNode | string)[] = [];
    const symbolType = props.symbol ?? [];
    const insertedCards: [string, string, number | undefined][] = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        // Custom token types
        if (token.type === 'magic_symbol') {
            result.push(h(Symbol, {
                value: token.content,
                type:  symbolType,
            }));
            continue;
        }

        if (token.type === 'region_tag') {
            const region = token.content.toLowerCase();
            const regionMap = regions[lang.value];
            const text = (regionMap?.[region] ?? region).toUpperCase();
            result.push(h('span', { class: 'magic-text-title' }, `[${text}]`));
            continue;
        }

        if (token.type === 'card_link') {
            const { id, text } = token.meta;
            const [cardId, partIndexText] = id.split('/');
            const partIndex = partIndexText ? parseInt(partIndexText) : undefined;

            if (!insertedCards.some(c => c[1] === cardId && c[2] === partIndex)) {
                result.push(h(CardAvatar, {
                    class: 'magic-text card',
                    id:    cardId,
                    part:  partIndex,
                    text:  text,
                }));
            } else {
                result.push(h('span', {
                    class: 'magic-text card repeated',
                }, text));
            }

            insertedCards.push([text, cardId, partIndex]);
            continue;
        }

        if (token.type === 'cr_link') {
            result.push(h(RouterLink, {
                to: {
                    query: route.query,
                    hash:  `#${token.content}`,
                },
            }, () => token.content));
            continue;
        }

        if (token.type === 'checkbox') {
            result.push(h('input', {
                type:  'checkbox',
                style: 'vertical-align: middle; transform: translateY(-10%)',
            }));
            continue;
        }

        if (token.type === 'copyable_hr') {
            result.push(h('div', { class: 'copyable-hr' }));
            continue;
        }

        if (token.type === 'hr') {
            result.push(h('hr'));
            continue;
        }

        // Standard markdown token
        if (token.type === 'text') {
            result.push(token.content);
            continue;
        }

        if (token.type === 'softbreak' || token.type === 'hardbreak') {
            result.push(h('br'));
            continue;
        }

        // Container token types
        if (token.type.endsWith('_open')) {
            const tag = token.tag;
            const closeIdx = tokens.findIndex((t, idx) => idx > i && t.type === token.type.replace('_open', '_close'));

            const children = tokensToVNodes(tokens.slice(i + 1, closeIdx));

            const attrs: Record<string, any> = {};
            if (token.attrGet('href')) {
                attrs.href = token.attrGet('href');
            }
            if (token.attrGet('target')) {
                attrs.target = token.attrGet('target');
            }

            result.push(h(tag, attrs, children));
            i = closeIdx;
            continue;
        }

        // Skip close tokens
        if (token.type.endsWith('_close')) {
            continue;
        }

        // Inline tokens
        if (token.type === 'inline' && token.children) {
            result.push(...tokensToVNodes(token.children));
            continue;
        }

        // Paragraph and other block elements
        if (token.type === 'paragraph_open') {
            const closeIdx = tokens.findIndex((t, idx) => idx > i && t.type === 'paragraph_close');
            const children = tokensToVNodes(tokens.slice(i + 1, closeIdx));
            result.push(h('p', children));
            i = closeIdx;
            continue;
        }
    }

    return result;
}

const render = () => {
    const defaultSlot = slots.default?.();
    if (!defaultSlot || defaultSlot.length === 0) {
        return [];
    }

    // Extract text content
    let text = '';
    for (const node of defaultSlot) {
        if (typeof node === 'string') {
            text += node;
        } else if (node.children && typeof node.children === 'string') {
            text += node.children;
        } else if (typeof node.children === 'object' && node.children !== null) {
            text += String(node.children);
        }
    }

    // Parse into tokens
    const tokens = props.inline ? md.parseInline(text, {}) : md.parse(text, {});

    // Convert to VNodes
    return tokensToVNodes(tokens);
};

</script>

<style lang="sass">
.magic-text.card
    display: inline
    text-decoration: underline

.magic-text.card.repeated
    display: inline
    text-decoration: dashed underline

.magic-text.emph
    font-weight: italic

.magic-text-title
    font-weight: bold
    margin-right: 5px

.copyable-hr
    position:   relative
    height:     1px
    background: #ccc
    margin:     1em 0
    user-select: all

.copyable-hr::before
    content: '===================='
    position: absolute
    left: 0
    right: 0
    color: transparent
    user-select: all
    pointer-events: none
</style>
