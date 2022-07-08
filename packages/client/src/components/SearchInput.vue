<style lang="sass" scoped>
.search-input
    & span.q-field__native
        position: absolute

        display: flex
        align-items: center

        height: 100%

    &.q-field--highlighted
        & .search-error
            text-decoration: underline wavy red

        & .token-punc
            color: $indigo

        & .token-string
            color: $blue-grey

        & .token-regex
            color: $brown

.search-token, .search-error
    white-space: pre
</style>

<script lang="ts">
import { defineComponent, computed, h } from 'vue';

import { QInput } from 'quasar';

import Parser from 'searcher/model/parser/parser';
import SearchError from 'searcher/model/error';

import { last } from 'lodash';

export default defineComponent({
    name: 'SearchInput',

    props: {
        modelValue: {
            type:     String,
            required: true,
        },
        isNumber: {
            type:    Boolean,
            default: false,
        },
    },

    emits: ['update:modelValue'],

    setup(props, { attrs, emit, slots }) {
        const result = computed(() => {
            const parser = new Parser(props.modelValue);

            try {
                const expr = parser.parse();

                return {
                    tokens: expr.tokens,
                };
            } catch (e) {
                return {
                    error:  e as SearchError,
                    tokens: parser.tokens,
                };
            }
        });

        return () => {
            const { error } = result.value;

            const spans = result.value.tokens.map(v => {
                if (error != null) {
                    if (
                        (v.location[0] <= error.location[0] && error.location[0] < v.location[1])
                        || (v.location[0] < error.location[1] && error.location[1] <= v.location[1])
                    ) {
                        const before = v.text.slice(0, error.location[0] - v.location[0]);
                        const center = v.text.slice(
                            error.location[0] - v.location[0],
                            error.location[1] - v.location[0],
                        );
                        const after = v.text.slice(error.location[1] - v.location[0]);

                        return h('span', { class: `search-token token-${v.type}` }, [
                            ...before.length > 0 ? [before] : [],
                            h('span', { class: 'search-error' }, center),
                            ...after.length > 0 ? [after] : [],
                        ]);
                    }
                }

                return h('span', { class: `search-token token-${v.type}` }, v.text);
            });

            if (
                error != null
                && error.type !== 'empty-input'
                && error.location[0] >= (last(result.value.tokens)?.location[1] ?? 0)
            ) {
                spans.push(h('span', { class: 'search-error' }, ' '));
            }

            return h(QInput, {
                ...attrs,
                'class':               'search-input',
                'modelValue':          props.modelValue,
                'onUpdate:modelValue': (newValue: string) => { emit('update:modelValue', newValue); },
            }, {
                ...slots,
                default: () => h(
                    'span',
                    { class: 'q-field__native' },
                    spans,
                ),
            });
        };
    },
});
</script>
