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

.card
    display: inline
    text-decoration: underline
</style>

<script lang="ts">
import type { VNode, PropType } from 'vue';
import { defineComponent, h } from 'vue';

import { useStore } from 'src/store';

import Symbol from './Symbol.vue';
import CardAvatar from './CardAvatar.vue';

export default defineComponent({
    props: {
        symbol: {
            type:    Array as PropType<string[]>,
            default: () => [],
        },

        cards: {
            type:    Array as PropType<{ id: string, text: string }[]>,
            default: () => [],
        },

        detectUrl: {
            type:    Boolean,
            default: false,
        },
    },

    setup(props, { attrs, slots }) {
        const store = useStore();

        const { symbols } = store.getters['magic/data'];

        return () => {
            const symbolType = props.symbol ?? [];

            const defaultSlot = slots.default!();

            const result: (VNode | string)[] = [];

            for (const node of defaultSlot) {
                if (typeof node.children === 'string' && typeof node.type === 'symbol') {
                    const regex = new RegExp(`(${[
                        '[\\n☐]',
                        '\\{[^}]+\\}',
                        ...props.cards.map(c => c.text),
                        ...props.detectUrl ? ['https?://[-a-zA-Z0-9/.]+'] : [],
                    ].join('|')})`);

                    const pieces = node.children.split(regex).filter(v => v !== '');

                    const insertedCards: [string, string][] = [];

                    for (const p of pieces) {
                        if (p === '\n') {
                            result.push(h('br'));
                            continue;
                        }

                        if (p === '☐') {
                            result.push(h('input', {
                                type:  'checkbox',
                                style: 'transform: translateY(15%)',
                            }));
                            continue;
                        }

                        if (p.startsWith('{') && p.endsWith('}')) {
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

                            continue;
                        }

                        if (props.detectUrl && /^https?:/.test(p)) {
                            result.push(h('a', {
                                href:   p.replace(/^http:/, 'https:'),
                                target: '_blank',
                            }, p));

                            continue;
                        }

                        const card = props.cards.find(c => c.text === p);

                        if (card != null && insertedCards.every(c => c[1] !== card.text)) {
                            if (!insertedCards.some(c => c[0] === card.id)) {
                                result.push(h(CardAvatar, {
                                    class: `card ${attrs.class}`,
                                    id:    card.id,
                                    text:  card.text,
                                }));
                            } else {
                                result.push(h('span', {
                                    class: `card ${attrs.class}`,
                                    id:    card.id,

                                }, card.text));
                            }

                            insertedCards.push([card.id, card.text]);
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
