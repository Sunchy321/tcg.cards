<style lang="sass" scoped>
.card
    display: inline
    text-decoration: underline

.emph
    font-weight: italic
</style>

<script lang="ts">
import type { VNode, PropType } from 'vue';
import { defineComponent, h } from 'vue';

import { RouterLink, useRoute } from 'vue-router';
import { useMagic } from 'store/games/magic';

import Symbol from './Symbol.vue';
import CardAvatar from './CardAvatar.vue';

import { escapeRegExp } from 'lodash';

export default defineComponent({
    props: {
        symbol: {
            type:    Array as PropType<string[]>,
            default: () => [],
        },

        cards: {
            type:    Array as PropType<{ id: string, text: string, part?: number }[]>,
            default: () => [],
        },

        detectUrl:  { type: Boolean, default: false },
        detectEmph: { type: Boolean, default: false },
        detectCr:   { type: Boolean, default: false },
    },

    setup(props, { attrs, slots }) {
        const route = useRoute();
        const magic = useMagic();

        return () => {
            const symbolType = props.symbol ?? [];

            const defaultSlot = slots.default!();

            const result: (VNode | string)[] = [];

            for (const node of defaultSlot) {
                if (typeof node.children === 'string' && typeof node.type === 'symbol') {
                    const regex = new RegExp(`(${[
                        '[\\n☐]',
                        '\\{[^}]+\\}',
                        '\\[(?:0|[+-](?:[1-9][0-9]*|X))\\]',
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

                        if (p.startsWith('{') && p.endsWith('}')) {
                            const content = p.slice(1, -1);

                            if (magic.symbols.includes(content)) {
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
                                class: 'emph',
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
                            if (!insertedCards.some(c => c[1] === card.id && c[2] === card.part)) {
                                result.push(h(CardAvatar, {
                                    class: `card ${attrs.class ?? ''}`,
                                    id:    card.id,
                                    part:  card.part,
                                    text:  card.text,
                                }));
                            } else {
                                result.push(h('span', {
                                    class: `card ${attrs.class ?? ''}`,
                                    id:    card.id,
                                    part:  card.part,
                                }, card.text));
                            }

                            insertedCards.push([card.text, card.id, card.part]);
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
    },
});
</script>
