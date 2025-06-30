<template>
    <render />
</template>

<script setup lang="ts">
import { VNode, h, useAttrs, ref, onMounted, computed } from 'vue';

import { RouterLink, useRoute } from 'vue-router';
import { useGame } from 'store/games/magic';

import Symbol from './Symbol.vue';
import CardAvatar from './CardAvatar.vue';

import { escapeRegExp } from 'lodash';

const regionImports = import.meta.glob<Record<string, string>>('@data/magic/localization/region/*.yml');

const props = withDefaults(defineProps<{
    symbol?:     string[];
    cards?:      { text: string, cardId: string, part?: number }[];
    lang?:       string;
    detectUrl?:  boolean;
    detectEmph?: boolean;
    detectCr?:   boolean;
}>(), {
    symbol:     () => [],
    cards:      () => [],
    lang:       undefined,
    detectUrl:  false,
    detectEmph: false,
    detectCr:   false,
});

const attrs = useAttrs();

const slots = defineSlots<{
    default: () => VNode[];
}>();

const route = useRoute();
const game = useGame();

const regions = ref<Record<string, Record<string, string>>>({});

const lang = computed(() => props.lang ?? game.locale);

const render = () => {
    const symbolType = props.symbol ?? [];

    const defaultSlot = slots.default!();

    const result: (VNode | string)[] = [];

    for (const node of defaultSlot) {
        if (typeof node.children === 'string' && typeof node.type === 'symbol') {
            const regex = new RegExp(`(${[
                '[\\n☐]',
                '\\{[^}]+\\}',
                '\\[(?:0|[+-](?:[1-9][0-9]*|X))\\]',
                '={20,}\n?',
                '\\[[A-Z]+\\]',
                ...[...props.cards]
                    .sort((a, b) => b.text.length - a.text.length)
                    .map(c => `\\b${escapeRegExp(c.text)}(?=s|\\b)`),
                ...props.detectUrl ? ['https?://[-a-zA-Z0-9/.?=&]+[-a-zA-Z0-9/]'] : [],
                ...props.detectEmph ? ['\\*[^*]+\\*'] : [],
                ...props.detectCr ? ['\\d+(?:\\.\\d+[a-z]?)?'] : [],
            ].join('|')})`);

            const pieces = node.children.split(regex).filter(v => v !== '');

            const insertedCards: [string, string, number | undefined][] = [];

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

                if (/^={20,}\n?$/.test(p)) {
                    result.push(h('div', { class: 'copyable-hr' }));

                    continue;
                }

                if (/\[[A-Z]+\]/.test(p)) {
                    const region = p.slice(1, -1).toLowerCase();

                    const regionMap = regions.value[lang.value];

                    const text = (regionMap?.[region] ?? region).toUpperCase();

                    result.push(h('span', {
                        class: `magic-text-title ${attrs.class ?? ''}`,
                    }, `[${text}]`));

                    continue;
                }

                if (p.startsWith('{') && p.endsWith('}')) {
                    const content = p.slice(1, -1);

                    if (game.symbols.includes(content)) {
                        result.push(h(Symbol, {
                            class: attrs.class,
                            value: p,
                            type:  symbolType,
                        }));
                    } else {
                        result.push(h('span', {
                            class: attrs.class,
                        }, p));
                    }

                    continue;
                }

                if (p.startsWith('[') && p.endsWith(']')) {
                    result.push(h(Symbol, {
                        class: attrs.class,
                        value: p,
                        type:  symbolType,
                    }));

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

                if (props.detectCr && /^\d+(\.\d+[a-z]?)?$/.test(p)) {
                    result.push(h(RouterLink, {
                        to: {
                            query: route.query,
                            hash:  `#${p}`,
                        },
                    }, () => p));

                    continue;
                }

                const card = props.cards.find(c => c.text === p);

                if (card != null && insertedCards.every(c => c[0] !== card.text)) {
                    if (!insertedCards.some(c => c[1] === card.cardId && c[2] === card.part)) {
                        result.push(h(CardAvatar, {
                            class: `magic-text card ${attrs.class ?? ''}`,
                            id:    card.cardId,
                            part:  card.part,
                            text:  card.text,
                        }));
                    } else {
                        result.push(h('span', {
                            class: `magic-text card ${attrs.class ?? ''}`,
                            id:    card.cardId,
                            part:  card.part,
                        }, card.text));
                    }

                    insertedCards.push([card.text, card.cardId, card.part]);
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

onMounted(async () => {
    const result: Record<string, any> = {};

    for (const path of Object.keys(regionImports)) {
        const lang = /([a-z]+)\.yml$/.exec(path)![1];

        result[lang] = await regionImports[path]();
    }

    regions.value = result;
});

</script>

<style lang="sass">
.magic-text.card
    display: inline
    text-decoration: underline

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
